import { prisma, type Admin } from "@srpanel/db"
import { resolveFlow } from "../../subscription/links"
import { AppError } from "../../util/errors"
import { configLabel } from "../../util/naming"
import { audit } from "../audit"
import { getHwidLimit } from "../hwidLimit"
import { getPendingStart, pendingExpiryMs } from "../pendingStart"
import { adapterFor, allowedInboundsFor, inboundsOf, listServersFor, recomputeClient } from "../servers"
import { assertQuota, getClientForActor } from "./access"
import { groupTargets, normalizeTargets } from "./grouping"
import { addToPanel, updateOnPanel } from "./panelSync"
import type { ClientTarget, ClientWithServers, LinkGroup } from "./types"

/**
 * Attaching / detaching an existing client.
 *
 * Until now the inbound list was frozen at creation time: moving a customer to another
 * server meant deleting and re-creating the client (new UUID, new links, lost counters).
 *
 * The rules that make this safe on 3x-ui:
 *  - links that share server+email are ONE remote client, and the inbound id list sent
 *    on update *is* its membership - so detaching part of it is an update with the
 *    remaining ids, and detaching all of it is a delete.
 *  - a new inbound whose protocol+flow already exists on that server joins the existing
 *    config (same email = the traffic counters survive) instead of creating a second one.
 */

type Link = ClientWithServers["servers"][number]

export interface TargetInboundOption {
	id: number
	label: string
	protocol: string
	port: number
	enable: boolean
}

export interface TargetServerOption {
	serverId: string
	serverName: string
	status: string
	isActive: boolean
	inbounds: TargetInboundOption[]
}

export interface ClientTargetsResult {
	client: ClientWithServers
	errors: string[]
	added: number
	removed: number
}

/** Servers + inbounds this actor may provision on (reseller access is applied). */
export async function clientTargetOptions(actor: Pick<Admin, "id" | "role">): Promise<TargetServerOption[]> {
	const servers = await listServersFor(actor)
	const out: TargetServerOption[] = []
	for (const server of servers) {
		const inbounds = await allowedInboundsFor(actor, server)
		out.push({
			serverId: server.id,
			serverName: server.name,
			status: server.status,
			isActive: server.isActive,
			inbounds: inbounds.map((i) => ({
				id: Number(i.id),
				label: String(i.remark ?? ""),
				protocol: String(i.protocol ?? ""),
				port: Number(i.port ?? 0),
				enable: Boolean(i.enable),
			})),
		})
	}
	return out
}

const keyOf = (t: { serverId: string; inboundId: number }) => `${t.serverId}:${t.inboundId}`
const missing = /not found|پیدا نشد/i

/** Replaces the whole target list of a client with `targets` (diffed, not re-created). */
export async function setClientTargets(actor: Admin, id: string, targets: ClientTarget[]): Promise<ClientTargetsResult> {
	const client = await getClientForActor(actor, id)
	const wanted = normalizeTargets(targets)
	if (!wanted.length) throw new AppError("دست‌کم یک اینباند باید انتخاب شود")
	const currentKeys = new Set(client.servers.map(keyOf))
	const wantedKeys = new Set(wanted.map(keyOf))
	const added = wanted.filter((t) => !currentKeys.has(keyOf(t)))
	const dropped = client.servers.filter((l) => !wantedKeys.has(keyOf(l)))
	if (!added.length && !dropped.length) return { client, errors: [], added: 0, removed: 0 }
	// a reseller may only attach servers/inbounds it has access to
	await assertQuota(actor, client.trafficLimit, added, client.id)
	const serverIds = [...new Set([...added.map((t) => t.serverId), ...dropped.map((l) => l.serverId)])]
	const servers = await prisma.server.findMany({ where: { id: { in: serverIds } } })
	for (const t of added) {
		const server = servers.find((s) => s.id === t.serverId)
		if (!server || !server.isActive) throw new AppError("یکی از سرورها در دسترس نیست")
	}
	// the client keeps its delayed start and its device limit while it moves around
	const pending = pendingExpiryMs(await getPendingStart(client.id))
	const expiryMsOverride = pending === null ? undefined : pending
	const limitHwid = await getHwidLimit(client.id)
	const errors: string[] = []

	// ---------- detach ----------
	const byEmail = new Map<string, { serverId: string; remoteEmail: string; keep: Link[]; drop: Link[] }>()
	for (const link of client.servers) {
		const k = `${link.serverId}|${link.remoteEmail}`
		const entry = byEmail.get(k) ?? { serverId: link.serverId, remoteEmail: link.remoteEmail, keep: [], drop: [] }
		if (wantedKeys.has(keyOf(link))) entry.keep.push(link)
		else entry.drop.push(link)
		byEmail.set(k, entry)
	}
	for (const entry of byEmail.values()) {
		if (!entry.drop.length) continue
		const server = servers.find((s) => s.id === entry.serverId)
		if (!server) continue
		const dropIds = entry.drop.map((l) => l.id)
		const sample = entry.keep[0] ?? entry.drop[0]!
		const inbound = inboundsOf(server).find((i) => i.id === sample.inboundId)
		const protocol = inbound?.protocol ?? "vless"
		try {
			if (entry.keep.length) {
				const group: LinkGroup = {
					serverId: entry.serverId,
					remoteEmail: entry.remoteEmail,
					inboundIds: entry.keep.map((l) => l.inboundId).sort((a, b) => a - b),
					linkIds: entry.keep.map((l) => l.id),
				}
				const flow = inbound ? resolveFlow(inbound, client.uuid) : ""
				await updateOnPanel(server, group, client, protocol, flow, expiryMsOverride, limitHwid)
			} else {
				await adapterFor(server).deleteClient(entry.drop.map((l) => l.inboundId), protocol, { uuid: client.uuid, email: entry.remoteEmail })
			}
			await prisma.clientServer.deleteMany({ where: { id: { in: dropIds } } })
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			// already gone on the panel - drop the local rows anyway
			if (missing.test(message)) await prisma.clientServer.deleteMany({ where: { id: { in: dropIds } } })
			else errors.push(`${server.name}: ${message}`)
		}
	}

	// ---------- attach ----------
	const kept = client.servers.filter((l) => wantedKeys.has(keyOf(l)))
	const label = configLabel(client)
	const usedEmails = new Map<string, Set<string>>()
	for (const link of kept) {
		const set = usedEmails.get(link.serverId) ?? new Set<string>()
		set.add(link.remoteEmail)
		usedEmails.set(link.serverId, set)
	}
	for (const group of groupTargets(added, servers, client.uuid)) {
		const server = group.server
		const inbounds = inboundsOf(server)
		// same protocol + flow on this server means the very same remote client
		const host = kept.find((l) => {
			if (l.serverId !== server.id) return false
			const ib = inbounds.find((i) => i.id === l.inboundId)
			return (ib?.protocol ?? "vless") === group.protocol && (ib ? resolveFlow(ib, client.uuid) : "") === group.flow
		})
		const used = usedEmails.get(server.id) ?? new Set<string>()
		let email = host?.remoteEmail ?? label
		if (!host) {
			let n = 1
			while (used.has(email)) {
				n++
				email = `${label}-${n}`
			}
			used.add(email)
			usedEmails.set(server.id, used)
		}
		const createdIds: string[] = []
		for (const inboundId of group.inboundIds) {
			const link = await prisma.clientServer.create({ data: { clientId: client.id, serverId: server.id, inboundId, remoteEmail: email } })
			createdIds.push(link.id)
		}
		try {
			if (host) {
				// extend the existing config: send its full membership, old inbounds included
				const sameEmail = kept.filter((l) => l.serverId === server.id && l.remoteEmail === email)
				const merged: LinkGroup = {
					serverId: server.id,
					remoteEmail: email,
					inboundIds: [...new Set([...sameEmail.map((l) => l.inboundId), ...group.inboundIds])].sort((a, b) => a - b),
					linkIds: [...sameEmail.map((l) => l.id), ...createdIds],
				}
				await updateOnPanel(server, merged, client, group.protocol, group.flow, expiryMsOverride, limitHwid)
			} else {
				const remoteEmail = await addToPanel(group, client, email, expiryMsOverride, limitHwid)
				if (remoteEmail !== email) await prisma.clientServer.updateMany({ where: { id: { in: createdIds } }, data: { remoteEmail } })
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			errors.push(`${server.name}: ${message}`)
			await prisma.clientServer.updateMany({ where: { id: { in: createdIds } }, data: { lastError: message.slice(0, 300) } })
		}
	}

	await recomputeClient(client.id)
	await audit(actor.id, "client.targets.set", client.id, { added: added.length, removed: dropped.length, errors: errors.length })
	return { client: await getClientForActor(actor, id), errors, added: added.length, removed: dropped.length }
}
