import { prisma, type Admin } from "@srpanel/db"
import { audit } from "./audit"
import { getClientForActor } from "./clients"
import type { ClientWithServers } from "./clients/types"
import { adapterFor } from "./servers"

/**
 * Client IP record — «آی‌پی‌های متصل».
 *
 * 3x-ui counts the source IPs of a client to enforce `limitIp`; the list itself is
 * only visible inside the panel. This service reads that record from every panel the
 * client lives on and can wipe it, which is what an operator actually needs when a
 * customer says "I changed my phone and now I am blocked".
 *
 * Read-only by default: nothing here changes the client, only the panel's IP log.
 */

export type ClientIpServer = {
	serverId: string
	serverName: string
	/** The remote (panel) email of this client on that server. */
	email: string
	ips: string[]
	/** Set when that one panel could not answer; the other servers still report. */
	error?: string
}

export type ClientIpReport = {
	/** The client's own limitIp (0 = unlimited). */
	limit: number
	/** Unique IPs across every panel. */
	total: number
	servers: ClientIpServer[]
}

export type ClientIpClearResult = { cleared: number; errors: string[] }

/** One remote client per server+email pair; several inbounds share the same record. */
function remoteTargets(client: ClientWithServers): Array<{ serverId: string; serverName: string; email: string }> {
	const seen = new Map<string, { serverId: string; serverName: string; email: string }>()
	for (const link of client.servers) {
		const key = `${link.serverId}:${link.remoteEmail}`
		if (!seen.has(key)) seen.set(key, { serverId: link.serverId, serverName: link.server.name, email: link.remoteEmail })
	}
	return [...seen.values()]
}

export async function clientIps(actor: Pick<Admin, "id" | "role">, clientId: string): Promise<ClientIpReport> {
	const client = await getClientForActor(actor, clientId)
	const targets = remoteTargets(client)
	const servers = await prisma.server.findMany({ where: { id: { in: [...new Set(targets.map((t) => t.serverId))] } } })
	const rows: ClientIpServer[] = []
	for (const target of targets) {
		const server = servers.find((s) => s.id === target.serverId)
		if (!server) continue
		try {
			rows.push({ ...target, ips: await adapterFor(server).getClientIps(target.email) })
		} catch (err) {
			rows.push({ ...target, ips: [], error: (err instanceof Error ? err.message : String(err)).slice(0, 200) })
		}
	}
	const unique = new Set(rows.flatMap((r) => r.ips))
	return { limit: Number(client.ipLimit) || 0, total: unique.size, servers: rows }
}

export async function clearClientIps(actor: Pick<Admin, "id" | "role">, clientId: string): Promise<ClientIpClearResult> {
	const client = await getClientForActor(actor, clientId)
	const targets = remoteTargets(client)
	const servers = await prisma.server.findMany({ where: { id: { in: [...new Set(targets.map((t) => t.serverId))] } } })
	const errors: string[] = []
	let cleared = 0
	for (const target of targets) {
		const server = servers.find((s) => s.id === target.serverId)
		if (!server) continue
		try {
			await adapterFor(server).clearClientIps(target.email)
			cleared++
		} catch (err) {
			errors.push(`${server.name}: ${err instanceof Error ? err.message : String(err)}`)
		}
	}
	await audit(actor.id, "client.ips.clear", client.id, { cleared, failed: errors.length })
	return { cleared, errors }
}
