import { prisma, type Admin, type Server } from "@srpanel/db"
import { decryptSecret, encryptSecret } from "../crypto/secretbox"
import { XuiAdapter } from "../panels/xui"
import type { PanelClientStat, PanelInbound, PanelServerStatus } from "../panels/types"
import type { StoredInbound } from "../subscription/links"
import { NotFoundError, PanelAuthError } from "../util/errors"
import { onClientStatusChanged } from "./notifications"

export function adapterFor(server: Pick<Server, "baseUrl" | "username" | "passwordEnc">): XuiAdapter {
	return new XuiAdapter({ baseUrl: server.baseUrl, username: server.username, password: decryptSecret(server.passwordEnc) })
}

export function publicHostOf(server: Pick<Server, "baseUrl" | "publicHost">): string {
	if (server.publicHost) return server.publicHost
	try {
		return new URL(server.baseUrl).hostname
	} catch {
		return server.baseUrl
	}
}

export function inboundsOf(server: Pick<Server, "inboundsJson">): StoredInbound[] {
	return Array.isArray(server.inboundsJson) ? (server.inboundsJson as unknown as StoredInbound[]) : []
}

export async function testConnection(conn: { baseUrl: string; username: string; password: string }): Promise<{
	status: PanelServerStatus
	inbounds: Array<Pick<PanelInbound, "id" | "remark" | "protocol" | "port" | "enable">>
}> {
	const adapter = new XuiAdapter(conn)
	await adapter.login()
	const [status, inbounds] = await Promise.all([adapter.getStatus(), adapter.listInbounds()])
	return { status, inbounds: inbounds.map((i) => ({ id: i.id, remark: i.remark, protocol: i.protocol, port: i.port, enable: i.enable })) }
}

export interface ServerInput {
	name: string
	baseUrl: string
	username: string
	password?: string
	publicHost?: string | null
	subBaseUrl?: string | null
	weight?: number
	isActive?: boolean
}

export async function createServer(input: ServerInput): Promise<Server> {
	if (!input.password) throw new NotFoundError("رمز عبور پنل لازم است")
	const server = await prisma.server.create({
		data: {
			name: input.name.trim(),
			baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
			username: input.username.trim(),
			passwordEnc: encryptSecret(input.password),
			publicHost: input.publicHost?.trim() || null,
			subBaseUrl: input.subBaseUrl?.trim() || null,
			weight: input.weight ?? 100,
			isActive: input.isActive ?? true,
		},
	})
	void syncServer(server.id).catch(() => undefined)
	return server
}

export async function updateServer(id: string, input: Partial<ServerInput>): Promise<Server> {
	const data: Record<string, unknown> = {}
	if (input.name !== undefined) data.name = input.name.trim()
	if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl.trim().replace(/\/+$/, "")
	if (input.username !== undefined) data.username = input.username.trim()
	if (input.password) data.passwordEnc = encryptSecret(input.password)
	if (input.publicHost !== undefined) data.publicHost = input.publicHost?.trim() || null
	if (input.subBaseUrl !== undefined) data.subBaseUrl = input.subBaseUrl?.trim() || null
	if (input.weight !== undefined) data.weight = input.weight
	if (input.isActive !== undefined) data.isActive = input.isActive
	return prisma.server.update({ where: { id }, data })
}

/** Full sync of one server: status + inbounds + per-client usage + online list. */
export async function syncServer(serverId: string): Promise<{ ok: boolean; inbounds?: number; error?: string }> {
	const server = await prisma.server.findUnique({ where: { id: serverId } })
	if (!server) throw new NotFoundError("سرور پیدا نشد")
	const startedAt = Date.now()
	try {
		const adapter = adapterFor(server)
		await adapter.login()
		const latencyMs = Date.now() - startedAt
		const status = await adapter.getStatus()
		const inbounds = await adapter.listInbounds()
		const onlines = await adapter.getOnlineEmails().catch(() => [] as string[])
		const stored = inbounds.map(({ clientStats: _stats, ...rest }) => rest)
		await prisma.$transaction([
			prisma.server.update({
				where: { id: server.id },
				data: {
					status: "ONLINE",
					lastSeenAt: new Date(),
					lastError: null,
					statusJson: status as any,
					inboundsJson: stored as any,
					inboundsSyncAt: new Date(),
				},
			}),
			prisma.serverMetric.create({
				data: {
					serverId: server.id,
					online: true,
					latencyMs,
					cpu: status.cpu,
					memUsed: BigInt(Math.round(status.memUsed)),
					memTotal: BigInt(Math.round(status.memTotal)),
					netUp: BigInt(Math.round(status.netUp ?? 0)),
					netDown: BigInt(Math.round(status.netDown ?? 0)),
					xrayState: status.xrayState,
				},
			}),
		])
		await applyClientStats(server.id, inbounds, onlines)
		return { ok: true, inbounds: inbounds.length }
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		await prisma.$transaction([
			prisma.server.update({
				where: { id: server.id },
				data: { status: err instanceof PanelAuthError ? "AUTH_ERROR" : "OFFLINE", lastError: message.slice(0, 500) },
			}),
			prisma.serverMetric.create({ data: { serverId: server.id, online: false } }),
		])
		return { ok: false, error: message }
	}
}

async function applyClientStats(serverId: string, inbounds: PanelInbound[], onlines: string[]): Promise<void> {
	const stats = new Map<string, PanelClientStat>()
	for (const ib of inbounds) for (const s of ib.clientStats ?? []) stats.set(`${ib.id}:${s.email}`, s)
	const links = await prisma.clientServer.findMany({ where: { serverId } })
	if (!links.length) return
	const now = new Date()
	const online = new Set(onlines)
	const touched = new Set<string>()
	const onlineClients = new Set<string>()
	const usageRows: Array<{ clientId: string; up: bigint; down: bigint }> = []
	for (const link of links) {
		const s = stats.get(`${link.inboundId}:${link.remoteEmail}`)
		if (!s) {
			await prisma.clientServer.update({ where: { id: link.id }, data: { lastError: "روی پنل پیدا نشد", lastSyncAt: now } })
			continue
		}
		const up = BigInt(Math.max(0, Math.round(s.up)))
		const down = BigInt(Math.max(0, Math.round(s.down)))
		// usage rows store deltas; a decrease means the counter was reset on the panel
		const dUp = up >= link.up ? up - link.up : up
		const dDown = down >= link.down ? down - link.down : down
		if (dUp + dDown > 0n) usageRows.push({ clientId: link.clientId, up: dUp, down: dDown })
		await prisma.clientServer.update({
			where: { id: link.id },
			data: { up, down, enabled: s.enable, lastSyncAt: now, lastError: null },
		})
		touched.add(link.clientId)
		if (online.has(link.remoteEmail)) onlineClients.add(link.clientId)
	}
	if (usageRows.length) await prisma.clientUsage.createMany({ data: usageRows })
	if (onlineClients.size) await prisma.client.updateMany({ where: { id: { in: [...onlineClients] } }, data: { lastOnlineAt: now } })
	for (const clientId of touched) await recomputeClient(clientId)
}

/** Re-aggregates usage across servers and derives the status label. */
export async function recomputeClient(clientId: string): Promise<void> {
	const client = await prisma.client.findUnique({ where: { id: clientId }, include: { servers: true } })
	if (!client) return
	const usedUp = client.servers.reduce((acc, s) => acc + s.up, 0n)
	const usedDown = client.servers.reduce((acc, s) => acc + s.down, 0n)
	let status = client.status
	if (status !== "DISABLED") {
		if (client.expiresAt && client.expiresAt.getTime() < Date.now()) status = "EXPIRED"
		else if (client.trafficLimit > 0n && usedUp + usedDown >= client.trafficLimit) status = "LIMITED"
		else status = "ACTIVE"
	}
	await prisma.client.update({ where: { id: clientId }, data: { usedUp, usedDown, status } })
	if (status !== client.status) await onClientStatusChanged(clientId, status)
}

/** Marks ACTIVE clients whose expiry passed as EXPIRED even if no panel sync happened. */
export async function enforceClientStatuses(): Promise<number> {
	const where = { status: "ACTIVE" as const, expiresAt: { lt: new Date() } }
	const expired = await prisma.client.findMany({ where, select: { id: true }, take: 500 })
	if (!expired.length) return 0
	const res = await prisma.client.updateMany({ where: { id: { in: expired.map((c) => c.id) } }, data: { status: "EXPIRED" } })
	for (const c of expired) await onClientStatusChanged(c.id, "EXPIRED")
	return res.count
}

/** Deletes old time-series rows (metrics: 7 days, usage: 90 days). */
export async function pruneHistory(): Promise<void> {
	const now = Date.now()
	await prisma.serverMetric.deleteMany({ where: { at: { lt: new Date(now - 7 * 86_400_000) } } })
	await prisma.clientUsage.deleteMany({ where: { at: { lt: new Date(now - 90 * 86_400_000) } } })
	await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
	await prisma.notificationLog.deleteMany({ where: { at: { lt: new Date(now - 120 * 86_400_000) } } })
	await prisma.incident.deleteMany({ where: { status: "RESOLVED", resolvedAt: { lt: new Date(now - 90 * 86_400_000) } } })
}

/** Deletes a server and all its client links (cascade). Remote clients on the panel are left untouched. */
export async function deleteServer(id: string): Promise<void> {
	await prisma.server.delete({ where: { id } })
}

/** Servers visible to an actor: owner sees all, admins see only servers they have access to. */
export async function listServersFor(actor: Pick<Admin, "id" | "role">): Promise<Array<Server & { clientCount: number }>> {
	const where = actor.role === "OWNER" ? {} : { adminAccess: { some: { adminId: actor.id } } }
	const rows = await prisma.server.findMany({
		where,
		orderBy: [{ isActive: "desc" }, { name: "asc" }],
		include: { _count: { select: { clients: true } } },
	})
	return rows.map(({ _count, ...s }) => ({ ...s, clientCount: _count.clients }))
}

/** Inbounds an actor may provision on a given server (empty inboundIds in access = all inbounds). */
export async function allowedInboundsFor(actor: Pick<Admin, "id" | "role">, server: Pick<Server, "id" | "inboundsJson">): Promise<StoredInbound[]> {
	const all = inboundsOf(server)
	if (actor.role === "OWNER") return all
	const access = await prisma.adminServerAccess.findUnique({ where: { adminId_serverId: { adminId: actor.id, serverId: server.id } } })
	if (!access) return []
	if (!access.inboundIds.length) return all
	return all.filter((i) => access.inboundIds.includes(i.id))
}
