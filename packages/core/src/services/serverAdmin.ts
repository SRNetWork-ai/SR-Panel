/**
 * Advanced server management (stage 3): one-server detail view - live status, per-inbound
 * breakdown, attached clients, health history and incidents - plus bulk sync.
 * Everything returned here is JSON-safe, so route handlers can hand it straight to the UI.
 */
import { prisma, type IncidentKind } from "@srpanel/db"
import { NotFoundError } from "../util/errors"
import { inboundAddressOf, inboundsOf, syncServer } from "./servers"

export interface ServerLiveStatus {
	cpu: number | null
	memUsed: number
	memTotal: number
	memPct: number | null
	diskUsed: number
	diskTotal: number
	diskPct: number | null
	uptime: number | null
	xrayState: string | null
	xrayVersion: string | null
	panelVersion: string | null
	netUp: number
	netDown: number
	totalSent: number
	totalRecv: number
	publicIp: string | null
	tcpCount: number | null
	udpCount: number | null
}

/** One inbound of the panel, merged with what SRPanel provisioned on it. */
export interface ServerInboundRow {
	id: number
	remark: string
	tag: string
	protocol: string
	port: number
	listen: string
	enable: boolean
	network: string
	security: string
	/** Host a client actually connects to for this inbound. */
	address: string
	addressSource: string
	expiryTime: number | null
	panelUp: number
	panelDown: number
	panelTotal: number
	clients: number
	activeClients: number
	up: number
	down: number
}

export interface ServerMetricPoint {
	at: string
	online: boolean
	latencyMs: number | null
	cpu: number | null
	memPct: number | null
	netUp: number
	netDown: number
}

export interface ServerClientRow {
	linkId: string
	clientId: string
	clientName: string
	clientStatus: string
	adminId: string
	inboundId: number
	remoteEmail: string
	up: number
	down: number
	enabled: boolean
	expiresAt: string | null
	lastOnlineAt: string | null
	lastSyncAt: string | null
	lastError: string | null
}

export interface ServerIncidentRow {
	id: string
	kind: IncidentKind
	status: string
	message: string | null
	startedAt: string
	resolvedAt: string | null
}

export interface ServerHealth {
	checks24: number
	fails24: number
	uptime24: number | null
	uptime7d: number | null
	latencyAvg24: number | null
	latencyLast: number | null
	openIncidents: number
}

export interface ServerDetail {
	id: string
	name: string
	baseUrl: string
	publicHost: string | null
	subBaseUrl: string | null
	authMode: "password" | "token"
	insecureTls: boolean
	weight: number
	isActive: boolean
	status: string
	panelVersion: string | null
	lastSeenAt: string | null
	lastError: string | null
	inboundsSyncAt: string | null
	createdAt: string
	/** Window (hours) the metric series and 24h figures were built from. */
	hours: number
	live: ServerLiveStatus | null
	health: ServerHealth
	totals: { inbounds: number; enabledInbounds: number; clients: number; activeClients: number; up: number; down: number }
	inbounds: ServerInboundRow[]
	metrics: ServerMetricPoint[]
	clients: ServerClientRow[]
	incidents: ServerIncidentRow[]
}

export interface ServerDetailOptions {
	/** Metric window, 1-168 hours (default 24). */
	hours?: number
	/** How many client links to return, 10-500 (default 100). */
	clientLimit?: number
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)
const n0 = (v: unknown): number => {
	const x = Number(v ?? 0)
	return Number.isFinite(x) ? x : 0
}
const nOrNull = (v: unknown): number | null => {
	if (v === null || v === undefined) return null
	const x = Number(v)
	return Number.isFinite(x) ? x : null
}
const pct = (used: number, total: number): number | null => (total > 0 ? Math.round((used / total) * 100) : null)
const rate = (total: number, fails: number): number | null => (total > 0 ? Math.round(((total - fails) / total) * 1000) / 10 : null)

function downsample<T>(rows: T[], max: number): T[] {
	if (rows.length <= max) return rows
	const step = rows.length / max
	const out: T[] = []
	for (let i = 0; i < max; i++) out.push(rows[Math.floor(i * step)]!)
	return out
}

/** Everything the server detail screen shows, in one query round. */
export async function serverDetail(serverId: string, opts: ServerDetailOptions = {}): Promise<ServerDetail> {
	const hours = Math.min(168, Math.max(1, Math.round(opts.hours ?? 24)))
	const clientLimit = Math.min(500, Math.max(10, Math.round(opts.clientLimit ?? 100)))
	const server = await prisma.server.findUnique({ where: { id: serverId } })
	if (!server) throw new NotFoundError("سرور پیدا نشد")

	const now = Date.now()
	const since = new Date(now - hours * 3_600_000)
	const since24 = new Date(now - 24 * 3_600_000)
	const since7d = new Date(now - 7 * 24 * 3_600_000)

	const [metricRows, checks24, fails24, checks7d, fails7d, latencyAgg, byInbound, activeByInbound, links, incidents, openIncidents] = await Promise.all([
		prisma.serverMetric.findMany({
			where: { serverId, at: { gte: since } },
			orderBy: { at: "asc" },
			select: { at: true, online: true, latencyMs: true, cpu: true, memUsed: true, memTotal: true, netUp: true, netDown: true },
		}),
		prisma.serverMetric.count({ where: { serverId, at: { gte: since24 } } }),
		prisma.serverMetric.count({ where: { serverId, at: { gte: since24 }, online: false } }),
		prisma.serverMetric.count({ where: { serverId, at: { gte: since7d } } }),
		prisma.serverMetric.count({ where: { serverId, at: { gte: since7d }, online: false } }),
		prisma.serverMetric.aggregate({ where: { serverId, at: { gte: since24 }, online: true }, _avg: { latencyMs: true } }),
		prisma.clientServer.groupBy({ by: ["inboundId"], where: { serverId }, _count: { _all: true }, _sum: { up: true, down: true } }),
		prisma.clientServer.groupBy({ by: ["inboundId"], where: { serverId, enabled: true }, _count: { _all: true } }),
		prisma.clientServer.findMany({
			where: { serverId },
			orderBy: [{ up: "desc" }, { down: "desc" }],
			take: clientLimit,
			include: { client: { select: { id: true, name: true, status: true, adminId: true, expiresAt: true, lastOnlineAt: true } } },
		}),
		prisma.incident.findMany({ where: { serverId }, orderBy: [{ status: "asc" }, { startedAt: "desc" }], take: 20 }),
		prisma.incident.count({ where: { serverId, status: "OPEN" } }),
	])

	const st = (server.statusJson ?? null) as Record<string, any> | null
	const live: ServerLiveStatus | null = st
		? {
				cpu: nOrNull(st.cpu),
				memUsed: n0(st.memUsed),
				memTotal: n0(st.memTotal),
				memPct: pct(n0(st.memUsed), n0(st.memTotal)),
				diskUsed: n0(st.diskUsed),
				diskTotal: n0(st.diskTotal),
				diskPct: pct(n0(st.diskUsed), n0(st.diskTotal)),
				uptime: nOrNull(st.uptime),
				xrayState: st.xrayState ? String(st.xrayState) : null,
				xrayVersion: st.xrayVersion ? String(st.xrayVersion) : null,
				panelVersion: server.panelVersion ?? (st.panelVersion ? String(st.panelVersion) : null),
				netUp: n0(st.netUp),
				netDown: n0(st.netDown),
				totalSent: n0(st.totalSent),
				totalRecv: n0(st.totalRecv),
				publicIp: st.publicIp ? String(st.publicIp) : null,
				tcpCount: nOrNull(st.tcpCount),
				udpCount: nOrNull(st.udpCount),
		  }
		: null

	const aggByInbound = new Map<number, { clients: number; up: number; down: number }>()
	for (const row of byInbound) {
		aggByInbound.set(row.inboundId, { clients: row._count._all, up: Number(row._sum.up ?? 0n), down: Number(row._sum.down ?? 0n) })
	}
	const activeMap = new Map<number, number>()
	for (const row of activeByInbound) activeMap.set(row.inboundId, row._count._all)

	const inbounds: ServerInboundRow[] = inboundsOf(server).map((ib) => {
		const raw = ib as unknown as Record<string, any>
		const id = Number(raw.id ?? 0)
		const addr = inboundAddressOf(server, ib)
		const agg = aggByInbound.get(id) ?? { clients: 0, up: 0, down: 0 }
		const stream = (raw.streamSettings ?? null) as Record<string, any> | null
		return {
			id,
			remark: String(raw.remark ?? ""),
			tag: String(raw.tag ?? ""),
			protocol: String(raw.protocol ?? ""),
			port: Number(raw.port ?? 0),
			listen: String(raw.listen ?? ""),
			enable: Boolean(raw.enable),
			network: String(stream?.network ?? "tcp"),
			security: String(stream?.security ?? "none"),
			address: String(addr.host ?? ""),
			addressSource: String(addr.source),
			expiryTime: raw.expiryTime ? Number(raw.expiryTime) : null,
			panelUp: n0(raw.up),
			panelDown: n0(raw.down),
			panelTotal: n0(raw.total),
			clients: agg.clients,
			activeClients: activeMap.get(id) ?? 0,
			up: agg.up,
			down: agg.down,
		}
	})

	const metrics: ServerMetricPoint[] = downsample(metricRows, 120).map((m) => ({
		at: m.at.toISOString(),
		online: m.online,
		latencyMs: m.latencyMs ?? null,
		cpu: m.cpu ?? null,
		memPct: pct(Number(m.memUsed ?? 0n), Number(m.memTotal ?? 0n)),
		netUp: Number(m.netUp ?? 0n),
		netDown: Number(m.netDown ?? 0n),
	}))

	const lastOnline = [...metricRows].reverse().find((m) => m.online && m.latencyMs !== null)

	const clients: ServerClientRow[] = links.map((l) => ({
		linkId: l.id,
		clientId: l.clientId,
		clientName: l.client.name,
		clientStatus: String(l.client.status),
		adminId: l.client.adminId,
		inboundId: l.inboundId,
		remoteEmail: l.remoteEmail,
		up: Number(l.up),
		down: Number(l.down),
		enabled: l.enabled,
		expiresAt: iso(l.client.expiresAt),
		lastOnlineAt: iso(l.client.lastOnlineAt),
		lastSyncAt: iso(l.lastSyncAt),
		lastError: l.lastError,
	}))

	return {
		id: server.id,
		name: server.name,
		baseUrl: server.baseUrl,
		publicHost: server.publicHost,
		subBaseUrl: server.subBaseUrl,
		authMode: server.authMode === "TOKEN" ? "token" : "password",
		insecureTls: Boolean(server.insecureTls),
		weight: server.weight,
		isActive: server.isActive,
		status: String(server.status),
		panelVersion: server.panelVersion ?? null,
		lastSeenAt: iso(server.lastSeenAt),
		lastError: server.lastError,
		inboundsSyncAt: iso(server.inboundsSyncAt),
		createdAt: server.createdAt.toISOString(),
		hours,
		live,
		health: {
			checks24,
			fails24,
			uptime24: rate(checks24, fails24),
			uptime7d: rate(checks7d, fails7d),
			latencyAvg24: latencyAgg._avg.latencyMs !== null && latencyAgg._avg.latencyMs !== undefined ? Math.round(latencyAgg._avg.latencyMs) : null,
			latencyLast: lastOnline?.latencyMs ?? null,
			openIncidents,
		},
		totals: {
			inbounds: inbounds.length,
			enabledInbounds: inbounds.filter((i) => i.enable).length,
			clients: byInbound.reduce((acc, r) => acc + r._count._all, 0),
			activeClients: activeByInbound.reduce((acc, r) => acc + r._count._all, 0),
			up: byInbound.reduce((acc, r) => acc + Number(r._sum.up ?? 0n), 0),
			down: byInbound.reduce((acc, r) => acc + Number(r._sum.down ?? 0n), 0),
		},
		inbounds,
		metrics,
		clients,
		incidents: incidents.map((i) => ({
			id: i.id,
			kind: i.kind,
			status: String(i.status),
			message: i.message,
			startedAt: i.startedAt.toISOString(),
			resolvedAt: iso(i.resolvedAt),
		})),
	}
}

export interface BulkSyncRow {
	id: string
	name: string
	ok: boolean
	inbounds: number | null
	error: string | null
}

export interface BulkSyncResult {
	total: number
	ok: number
	failed: Array<{ id: string; name: string; error: string }>
	results: BulkSyncRow[]
}

/**
 * Syncs many servers at once (all active ones by default), five at a time so a
 * large fleet does not open dozens of panel sessions in the same instant.
 */
export async function syncServers(ids?: string[]): Promise<BulkSyncResult> {
	const where = ids && ids.length ? { id: { in: ids } } : { isActive: true }
	const servers = await prisma.server.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" } })
	const run = async (s: { id: string; name: string }): Promise<BulkSyncRow> => {
		try {
			const r = await syncServer(s.id)
			return { id: s.id, name: s.name, ok: r.ok, inbounds: r.inbounds ?? null, error: r.error ?? null }
		} catch (err) {
			return { id: s.id, name: s.name, ok: false, inbounds: null, error: err instanceof Error ? err.message : String(err) }
		}
	}
	const results: BulkSyncRow[] = []
	for (let i = 0; i < servers.length; i += 5) {
		results.push(...(await Promise.all(servers.slice(i, i + 5).map(run))))
	}
	return {
		total: results.length,
		ok: results.filter((r) => r.ok).length,
		failed: results.filter((r) => !r.ok).map((r) => ({ id: r.id, name: r.name, error: r.error ?? "" })),
		results,
	}
}
