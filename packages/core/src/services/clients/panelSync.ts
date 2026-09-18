import { prisma, type Client, type Server } from "@srpanel/db"
import type { InboundProtocol } from "../../panels/types"
import { resolveFlow } from "../../subscription/links"
import { AppError } from "../../util/errors"
import { remoteSubId } from "../../util/naming"
import { getPendingStart, pendingExpiryMs } from "../pendingStart"
import { adapterFor, inboundsOf } from "../servers"
import { groupLinks, provisionInput } from "./grouping"
import { COLLISION, PANEL_ATTEMPTS, type ClientWithServers, type LinkGroup, type PanelGroup } from "./types"

/**
 * Creates one remote client for a whole group of inbounds.
 *
 * 3x-ui rejects a client whose subId or email is already taken; the subId is derived
 * from the group, but two customers may well carry the same name, so on a collision we
 * retry with a fresh salt / a numeric suffix instead of leaving the group unprovisioned.
 */
export async function addToPanel(group: PanelGroup, client: Client, baseEmail: string, expiryMsOverride?: number): Promise<string> {
	const { server, protocol, flow, inboundIds } = group
	let email = baseEmail
	let last: unknown
	for (let attempt = 0; attempt < PANEL_ATTEMPTS; attempt++) {
		const subId = remoteSubId(client.subToken, server.id, inboundIds[0]!, attempt ? `r${attempt}` : "")
		try {
			await adapterFor(server).addClient(inboundIds, protocol, provisionInput(client, email, flow, subId, expiryMsOverride))
			return email
		} catch (err) {
			last = err
			const message = err instanceof Error ? err.message : String(err)
			if (!COLLISION.test(message)) throw err
			if (/sub\s*id/i.test(message)) continue
			if (/e-?mail/i.test(message)) {
				email = `${baseEmail}-${attempt + 2}`
				continue
			}
			throw err
		}
	}
	throw last instanceof Error ? last : new AppError(`ساخت کانفیگ روی ${server.name} ناموفق بود`)
}

/** The email never changes on update, but the derived subId may still hit another client. */
export async function updateOnPanel(server: Server, group: LinkGroup, client: Client, protocol: InboundProtocol, flow: string, expiryMsOverride?: number): Promise<void> {
	let last: unknown
	for (let attempt = 0; attempt < PANEL_ATTEMPTS; attempt++) {
		const subId = remoteSubId(client.subToken, server.id, group.inboundIds[0]!, attempt ? `r${attempt}` : "")
		try {
			await adapterFor(server).updateClient(group.inboundIds, protocol, provisionInput(client, group.remoteEmail, flow, subId, expiryMsOverride))
			return
		} catch (err) {
			last = err
			const message = err instanceof Error ? err.message : String(err)
			if (COLLISION.test(message) && /sub\s*id/i.test(message)) continue
			throw err
		}
	}
	throw last instanceof Error ? last : new AppError(`به‌روزرسانی کانفیگ روی ${server.name} ناموفق بود`)
}

/**
 * Pushes the current DB state of a client to every panel it lives on.
 *
 * Links that share an email are one remote client attached to several inbounds, so they
 * are updated in a single call - a partial inbound list would detach it from the rest.
 * The remote email is kept as created: renaming it on the panel would detach the
 * traffic counters that 3x-ui keys by email.
 */
export async function pushClient(client: ClientWithServers): Promise<string[]> {
	const errors: string[] = []
	// a client whose period has not started yet keeps its negative panel expiry
	const pending = pendingExpiryMs(await getPendingStart(client.id))
	const expiryMsOverride = pending === null ? undefined : pending
	const servers = await prisma.server.findMany({ where: { id: { in: [...new Set(client.servers.map((s) => s.serverId))] } } })
	for (const group of groupLinks(client.servers)) {
		const server = servers.find((s) => s.id === group.serverId)
		if (!server) continue
		const inbound = inboundsOf(server).find((i) => i.id === group.inboundIds[0])
		try {
			const flow = inbound ? resolveFlow(inbound, client.uuid) : ""
			await updateOnPanel(server, group, client, inbound?.protocol ?? "vless", flow, expiryMsOverride)
			await prisma.clientServer.updateMany({ where: { id: { in: group.linkIds } }, data: { lastError: null } })
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			errors.push(`${server.name}: ${message}`)
			await prisma.clientServer.updateMany({ where: { id: { in: group.linkIds } }, data: { lastError: message.slice(0, 300) } })
		}
	}
	return errors
}
