import { prisma, type Admin, type Server } from "@srpanel/db"
import { decryptSecret, encryptSecret } from "../crypto/secretbox"
import { XuiAdapter, normalizePanelBaseUrl } from "../panels/xui"
import type { PanelAuthMode, PanelCapabilities, PanelClientStat, PanelInbound, PanelInboundOption, PanelServerStatus } from "../panels/types"
import type { StoredInbound } from "../subscription/links"
import { preferServerHostFromEnv, resolveInboundAddress, type InboundAddressContext, type ResolvedInboundAddress } from "../subscription/host"
import { AppError, NotFoundError, PanelAuthError } from "../util/errors"
import { onClientStatusChanged } from "./notifications"

type ServerAuthFields = Pick<
	Server,
	"baseUrl" | "username" | "passwordEnc" | "authMode" | "apiTokenEnc" | "totpSecretEnc" | "insecureTls"
>

type ServerAddressFields = Pick<Server, "baseUrl" | "publicHost" | "statusJson">

export function adapterFor(server: ServerAuthFields): XuiAdapter {
	return new XuiAdapter({
		baseUrl: server.baseUrl,
		authMode: server.authMode === "TOKEN" ? "token" : "password",
		username: server.username || undefined,
		password: server.passwordEnc ? decryptSecret(server.passwordEnc) : undefined,
		apiToken: server.apiTokenEnc ? decryptSecret(server.apiTokenEnc) : undefined,
		totpSecret: server.totpSecretEnc ? decryptSecret(server.totpSecretEnc) : undefined,
		insecureTls: server.insecureTls,
	})
}

/**
 * Server-level host only: the manual override, otherwise the panel hostname.
 * Configs must not be built from this alone - use `inboundAddressOf` so the address
 * configured on the inbound wins over the panel domain.
 */
export function publicHostOf(server: Pick<Server, "baseUrl" | "publicHost">): string {
	if (server.publicHost) return server.publicHost
	try {
		return new URL(server.baseUrl).hostname
	} catch {
		return server.baseUrl
	}
}

/** Everything the address resolver needs to know about a server. */
export function serverHostContextOf(server: ServerAddressFields): InboundAddressContext {
	const status = (server.statusJson ?? null) as { publicIp?: unknown } | null
	return {
		publicHost: server.publicHost,
		baseUrl: server.baseUrl,
		publicIp: status?.publicIp ?? null,
		preferServerHost: preferServerHostFromEnv(),
	}
}

/** The address a client actually connects to for one inbound of this server. */
export function inboundAddressOf(server: ServerAddressFields, inbound: StoredInbound): ResolvedInboundAddress {
	const resolved = resolveInboundAddress(inbound, serverHostContextOf(server))
	if (resolved.host) return resolved
	return { host: publicHostOf(server), source: server.publicHost ? "server-public-host" : "panel-url" }
}

export function inboundsOf(server: Pick<Server, "inboundsJson">): StoredInbound[] {
	return Array.isArray(server.inboundsJson) ? (server.inboundsJson as unknown as StoredInbound[]) : []
}

export interface PanelConnInput {
	baseUrl: string
	authMode?: PanelAuthMode
	username?: string
	password?: string
	apiToken?: string
	totpSecret?: string
	twoFactorCode?: string
	insecureTls?: boolean
}

/** Probes a panel before it is saved: auth, version, capabilities and the inbound picker list. */
export async function testConnection(conn: PanelConnInput): Promise<{
	ok: true
	baseUrl: string
	status: PanelServerStatus
	capabilities: PanelCapabilities
	inbounds: PanelInboundOption[]
}> {
	const adapter = new XuiAdapter(conn)
	await adapter.login()
	const capabilities = await adapter.probe()
	const [status, inbounds] = await Promise.all([adapter.getStatus(), adapter.listInboundOptions()])
	return { ok: true, baseUrl: adapter.baseUrl, status, capabilities, inbounds }
}

export interface ServerInput {
	name: string
	baseUrl: string
	authMode?: PanelAuthMode
	username?: string
	password?: string
	apiToken?: string
	totpSecret?: string | null
	insecureTls?: boolean
	publicHost?: string | null
	subBaseUrl?: string | null
	weight?: number
	isActive?: boolean
}

export async function createServer(input: ServerInput): Promise<Server> {
	const authMode: PanelAuthMode = input.authMode ?? (input.apiToken ? "token" : "password")
	const baseUrl = normalizePanelBaseUrl(input.baseUrl)
	if (!baseUrl) throw new AppError("آدرس پنل نامعتبر است")
	if (authMode === "token" && !input.apiToken) throw new AppError("توکن API پنل لازم است")
	if (authMode === "password" && (!input.username || !input.password))
		throw new AppError("نام کاربری و رمز عبور پنل لازم است")
	const server = await prisma.server.create({
		data: {
			name: input.name.trim(),
			baseUrl,
			authMode: authMode === "token" ? "TOKEN" : "PASSWORD",
			username: input.username?.trim() || "",
			passwordEnc: input.password ? encryptSecret(input.password) : "",
			apiTokenEnc: input.apiToken ? encryptSecret(input.apiToken) : null,
			totpSecretEnc: input.totpSecret ? encryptSecret(input.totpSecret.trim()) : null,
			insecureTls: input.insecureTls ?? false,
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
	if (input.baseUrl !== undefined) {
		const baseUrl = normalizePanelBaseUrl(input.baseUrl)
		if (!baseUrl) throw new AppError("آدرس پنل نامعتبر است")
		data.baseUrl = baseUrl
	}
	if (input.authMode !== undefined) data.authMode = input.authMode === "token" ? "TOKEN" : "PASSWORD"
	if (input.username !== undefined) data.username = input.username?.trim() || ""
	if (input.password) data.passwordEnc = encryptSecret(input.password)
	if (input.apiToken) data.apiTokenEnc = encryptSecret(input.apiToken)
	if (input.totpSecret !== undefined)
		data.totpSecretEnc = input.totpSecret ? encryptSecret(input.totpSecret.trim()) : null
	if (input.insecureTls !== undefined) data.insecureTls = input.insecureTls
	if (input.publicHost !== undefined) data.publicHost = input.publicHost?.trim() || null
	if (input.subBaseUrl !== undefined) data.subBaseUrl = input.subBaseUrl?.trim() || null
	if (input.weight !== undefined) data.weight = input.weight
	if (input.isActive !== undefined) data.isActive = input.isActive
	const server = await prisma.server.update({ where: { id }, data })
	void syncServer(server.id).catch(() => undefined)
	return server
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
		const capabilities = await adapter.probe().catch(() => null)
		const status = await adapter.getStatus()
		const inbounds = await adapter.listInbounds()
		// `/panel/api/inbounds/options` is the only endpoint that exposes the per-inbound share
		// address, so we merge it into the stored inbounds - link building needs it.
		const options: PanelInboundOption[] =
			capabilities?.inboundOptions === false ? [] : await adapter.listInboundOptions().catch(() => [] as PanelInboundOption[])
		const addrByInbound = new Map<number, { shareAddr?: string; nodeAddress?: string }>()
		for (const o of options) {
			if (o.shareAddr || o.nodeAddress) addrByInbound.set(o.id, { shareAddr: o.shareAddr, nodeAddress: o.nodeAddress })
		}
		const onlines = await adapter.getOnlineEmails().catch(() => [] as string[])
		const stored = inbounds.map(({ clientStats: _stats, ...rest }) => {
			const extra = addrByInbound.get(rest.id)
			if (!extra) return rest
			return { ...rest, shareAddr: extra.shareAddr ?? rest.shareAddr, nodeAddress: extra.nodeAddress ?? rest.nodeAddress }
		})
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
					panelVersion: capabilities?.panelVersion ?? status.panelVersion ?? null,
					capsJson: (capabilities ?? undefined) as any,
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
