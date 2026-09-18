import type { Client } from "@srpanel/db"
import type { Server } from "@srpanel/db"
import type { ProvisionClientInput } from "../../panels/types"
import { resolveFlow } from "../../subscription/links"
import { inboundsOf } from "../servers"
import type { ClientTarget, ClientWithServers, LinkGroup, PanelGroup } from "./types"

/** Drops duplicates/garbage and orders the list so the email suffixes stay stable. */
export function normalizeTargets(list: ClientTarget[]): ClientTarget[] {
	const out: ClientTarget[] = []
	for (const t of list) {
		const serverId = String(t?.serverId ?? "")
		const inboundId = Number(t?.inboundId)
		if (!serverId || !Number.isFinite(inboundId)) continue
		if (!out.some((x) => x.serverId === serverId && x.inboundId === inboundId)) out.push({ serverId, inboundId })
	}
	return out.sort((a, b) => (a.serverId === b.serverId ? a.inboundId - b.inboundId : a.serverId < b.serverId ? -1 : 1))
}

/**
 * Turns the picked inbounds into remote clients.
 *
 * 3X-UI attaches a single client to many inbounds (that is what its own client editor
 * does), so one config is created per server - not per inbound. The client row itself
 * is protocol- and flow-shaped though, so inbounds needing a different shape (a VLESS
 * vision inbound next to a plain one) still become a second config on that panel.
 */
export function groupTargets(targets: ClientTarget[], servers: Server[], uuid: string): PanelGroup[] {
	const groups = new Map<string, PanelGroup>()
	for (const t of targets) {
		const server = servers.find((s) => s.id === t.serverId)
		if (!server) continue
		const inbound = inboundsOf(server).find((i) => i.id === t.inboundId)
		const protocol = inbound?.protocol ?? "vless"
		const flow = inbound ? resolveFlow(inbound, uuid) : ""
		const key = `${server.id}|${protocol}|${flow}`
		const group = groups.get(key)
		if (group) group.inboundIds.push(t.inboundId)
		else groups.set(key, { server, protocol, flow, inboundIds: [t.inboundId] })
	}
	const out = [...groups.values()]
	for (const group of out) group.inboundIds.sort((a, b) => a - b)
	return out
}

/** Groups stored links by the identity the panel uses: one email per server = one client. */
export function groupLinks(links: ClientWithServers["servers"]): LinkGroup[] {
	const groups = new Map<string, LinkGroup>()
	for (const link of [...links].sort((a, b) => a.inboundId - b.inboundId)) {
		const key = `${link.serverId}|${link.remoteEmail}`
		const group = groups.get(key)
		if (group) {
			group.inboundIds.push(link.inboundId)
			group.linkIds.push(link.id)
		} else {
			groups.set(key, { serverId: link.serverId, remoteEmail: link.remoteEmail, inboundIds: [link.inboundId], linkIds: [link.id] })
		}
	}
	return [...groups.values()]
}

/**
 * `expiryMsOverride` carries the delayed-start value: 3x-ui counts a negative
 * expiryTime from the client's first connection instead of from now.
 */
export function provisionInput(client: Client, remoteEmail: string, flow: string, subId: string, expiryMsOverride?: number): ProvisionClientInput {
	return {
		uuid: client.uuid,
		email: remoteEmail,
		totalBytes: Number(client.trafficLimit),
		expiryTimeMs: expiryMsOverride !== undefined ? expiryMsOverride : client.expiresAt ? client.expiresAt.getTime() : 0,
		limitIp: client.ipLimit,
		enable: client.status !== "DISABLED",
		subId,
		flow,
		tgId: client.telegramId ?? "",
	}
}
