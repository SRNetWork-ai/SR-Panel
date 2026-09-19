import { prisma, type Admin } from "@srpanel/db"
import { audit } from "./audit"
import { getClientForActor, pushClient } from "./clients"
import type { ClientWithServers } from "./clients/types"
import { writeHwidLimit } from "./hwidLimit"
import { adapterFor } from "./servers"

/**
 * Device management - «مدیریت دستگاه».
 *
 * Two halves:
 *  - the limit (`limitHwid`) which SRPanel owns and pushes to every panel of the
 *    client; saving it re-pushes the client so the panel enforces it immediately.
 *  - the device records the panel itself keeps, which can be listed and released
 *    when a customer replaces a phone. Builds without HWID simply report nothing.
 */

export type ClientDeviceServer = {
	serverId: string
	serverName: string
	email: string
	devices: string[]
	/** Set when that one panel could not answer; the other servers still report. */
	error?: string
}

export type ClientDeviceReport = {
	/** 0 = unlimited */
	limit: number
	/** Unique devices across every panel. */
	total: number
	servers: ClientDeviceServer[]
}

export type ClientHwidResult = { limit: number; errors: string[] }
export type ClientDeviceClearResult = { cleared: number; errors: string[] }

/** One remote client per server+email pair; several inbounds share the same record. */
function remoteTargets(client: ClientWithServers): Array<{ serverId: string; serverName: string; email: string }> {
	const seen = new Map<string, { serverId: string; serverName: string; email: string }>()
	for (const link of client.servers) {
		const key = `${link.serverId}:${link.remoteEmail}`
		if (!seen.has(key)) seen.set(key, { serverId: link.serverId, serverName: link.server.name, email: link.remoteEmail })
	}
	return [...seen.values()]
}

const serversOf = (targets: Array<{ serverId: string }>) =>
	prisma.server.findMany({ where: { id: { in: [...new Set(targets.map((t) => t.serverId))] } } })

export async function clientDevices(actor: Pick<Admin, "id" | "role">, clientId: string): Promise<ClientDeviceReport> {
	const client = await getClientForActor(actor, clientId)
	const { getHwidLimit } = await import("./hwidLimit")
	const targets = remoteTargets(client)
	const servers = await serversOf(targets)
	const rows: ClientDeviceServer[] = []
	for (const target of targets) {
		const server = servers.find((s) => s.id === target.serverId)
		if (!server) continue
		try {
			rows.push({ ...target, devices: await adapterFor(server).getClientDevices(target.email) })
		} catch (err) {
			rows.push({ ...target, devices: [], error: (err instanceof Error ? err.message : String(err)).slice(0, 200) })
		}
	}
	const unique = new Set(rows.flatMap((r) => r.devices))
	return { limit: await getHwidLimit(client.id), total: unique.size, servers: rows }
}

/** Saves the limit and re-pushes the client so every panel applies it right away. */
export async function setClientHwidLimit(
	actor: Pick<Admin, "id" | "role">,
	clientId: string,
	input: number,
): Promise<ClientHwidResult> {
	const client = await getClientForActor(actor, clientId)
	const limit = await writeHwidLimit(client.id, input)
	const errors = await pushClient(client)
	await audit(actor.id, "client.hwid.set", client.id, { limit, failed: errors.length })
	return { limit, errors }
}

export async function clearClientDevices(
	actor: Pick<Admin, "id" | "role">,
	clientId: string,
): Promise<ClientDeviceClearResult> {
	const client = await getClientForActor(actor, clientId)
	const targets = remoteTargets(client)
	const servers = await serversOf(targets)
	const errors: string[] = []
	let cleared = 0
	for (const target of targets) {
		const server = servers.find((s) => s.id === target.serverId)
		if (!server) continue
		try {
			await adapterFor(server).clearClientDevices(target.email)
			cleared++
		} catch (err) {
			errors.push(`${server.name}: ${err instanceof Error ? err.message : String(err)}`)
		}
	}
	await audit(actor.id, "client.devices.clear", client.id, { cleared, failed: errors.length })
	return { cleared, errors }
}
