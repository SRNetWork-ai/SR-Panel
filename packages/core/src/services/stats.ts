import { prisma, type Admin } from "@srpanel/db"
import { clientScope } from "./clients"

export interface DashboardStats {
	clients: { total: number; active: number; expired: number; limited: number; disabled: number; onlineNow: number; expiringSoon: number }
	servers: { total: number; online: number; offline: number }
	traffic: { usedBytes: number; allocatedBytes: number; todayBytes: number }
	admins?: { total: number; active: number }
	quota?: { trafficQuota: number | null; allocated: number; clientLimit: number | null; clientCount: number; expiresAt: string | null }
	/** last 14 days usage, oldest first */
	usageSeries: Array<{ day: string; up: number; down: number }>
	serverList: Array<{
		id: string
		name: string
		status: string
		lastSeenAt: string | null
		cpu: number | null
		memPct: number | null
		clients: number
		xrayState: string | null
	}>
	recentClients: Array<{ id: string; name: string; status: string; createdAt: string; usedBytes: number; trafficLimit: number; expiresAt: string | null }>
}

const n = (b: bigint | number | null | undefined) => Number(b ?? 0)

export async function dashboardStats(actor: Admin): Promise<DashboardStats> {
	const scope = clientScope(actor)
	const now = Date.now()
	const soon = new Date(now + 3 * 86_400_000)
	const onlineSince = new Date(now - 3 * 60_000)
	const dayStart = new Date()
	dayStart.setHours(0, 0, 0, 0)
	const since14 = new Date(now - 14 * 86_400_000)

	const [byStatus, onlineNow, expiringSoon, servers, trafficAgg, todayAgg, usageRows, recentClients, serverClientCounts] = await Promise.all([
		prisma.client.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
		prisma.client.count({ where: { ...scope, lastOnlineAt: { gte: onlineSince } } }),
		prisma.client.count({ where: { ...scope, status: "ACTIVE", expiresAt: { gt: new Date(now), lt: soon } } }),
		actor.role === "OWNER"
			? prisma.server.findMany({ orderBy: { name: "asc" } })
			: prisma.server.findMany({ where: { adminAccess: { some: { adminId: actor.id } }, isActive: true }, orderBy: { name: "asc" } }),
		prisma.client.aggregate({ where: scope, _sum: { usedUp: true, usedDown: true, trafficLimit: true } }),
		prisma.clientUsage.aggregate({ where: { at: { gte: dayStart }, client: scope }, _sum: { up: true, down: true } }),
		prisma.clientUsage.findMany({ where: { at: { gte: since14 }, client: scope }, select: { at: true, up: true, down: true } }),
		prisma.client.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 6 }),
		prisma.clientServer.groupBy({ by: ["serverId"], _count: { _all: true }, where: { client: scope } }),
	])

	const count = (s: string) => byStatus.find((x) => x.status === s)?._count._all ?? 0

	const days = new Map<string, { up: number; down: number }>()
	for (let i = 13; i >= 0; i--) days.set(new Date(now - i * 86_400_000).toISOString().slice(0, 10), { up: 0, down: 0 })
	for (const r of usageRows) {
		const key = r.at.toISOString().slice(0, 10)
		const d = days.get(key)
		if (d) {
			d.up += Number(r.up)
			d.down += Number(r.down)
		}
	}

	const stats: DashboardStats = {
		clients: {
			total: byStatus.reduce((a, x) => a + x._count._all, 0),
			active: count("ACTIVE"),
			expired: count("EXPIRED"),
			limited: count("LIMITED"),
			disabled: count("DISABLED"),
			onlineNow,
			expiringSoon,
		},
		servers: {
			total: servers.length,
			online: servers.filter((s) => s.status === "ONLINE").length,
			offline: servers.filter((s) => s.status !== "ONLINE").length,
		},
		traffic: {
			usedBytes: n(trafficAgg._sum.usedUp) + n(trafficAgg._sum.usedDown),
			allocatedBytes: n(trafficAgg._sum.trafficLimit),
			todayBytes: n(todayAgg._sum.up) + n(todayAgg._sum.down),
		},
		usageSeries: [...days.entries()].map(([day, v]) => ({ day, ...v })),
		serverList: servers.map((s) => {
			const st = (s.statusJson ?? {}) as Record<string, any>
			const memTotal = Number(st.memTotal ?? 0)
			return {
				id: s.id,
				name: s.name,
				status: s.status,
				lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
				cpu: st.cpu !== undefined ? Number(st.cpu) : null,
				memPct: memTotal > 0 ? Math.round((Number(st.memUsed ?? 0) / memTotal) * 100) : null,
				clients: serverClientCounts.find((c) => c.serverId === s.id)?._count._all ?? 0,
				xrayState: st.xrayState ? String(st.xrayState) : null,
			}
		}),
		recentClients: recentClients.map((c) => ({
			id: c.id,
			name: c.name,
			status: c.status,
			createdAt: c.createdAt.toISOString(),
			usedBytes: n(c.usedUp) + n(c.usedDown),
			trafficLimit: n(c.trafficLimit),
			expiresAt: c.expiresAt?.toISOString() ?? null,
		})),
	}

	if (actor.role === "OWNER") {
		const [total, active] = await Promise.all([prisma.admin.count(), prisma.admin.count({ where: { isActive: true } })])
		stats.admins = { total, active }
	} else {
		stats.quota = {
			trafficQuota: actor.trafficQuota === null ? null : n(actor.trafficQuota),
			allocated: n(trafficAgg._sum.trafficLimit),
			clientLimit: actor.clientLimit,
			clientCount: stats.clients.total,
			expiresAt: actor.expiresAt?.toISOString() ?? null,
		}
	}
	return stats
}

/** Per-server metrics for the last N hours (for sparkline charts). */
export async function serverMetrics(serverId: string, hours = 24) {
	const rows = await prisma.serverMetric.findMany({
		where: { serverId, at: { gte: new Date(Date.now() - hours * 3_600_000) } },
		orderBy: { at: "asc" },
		select: { at: true, online: true, latencyMs: true, cpu: true, memUsed: true, memTotal: true, netUp: true, netDown: true },
	})
	return rows.map((r) => ({
		at: r.at.toISOString(),
		online: r.online,
		latencyMs: r.latencyMs,
		cpu: r.cpu,
		memPct: r.memTotal && r.memTotal > 0n ? Math.round((Number(r.memUsed ?? 0n) / Number(r.memTotal)) * 100) : null,
		netUp: n(r.netUp),
		netDown: n(r.netDown),
	}))
}

/** Per-client daily usage for the last N days. */
export async function clientUsageSeries(clientId: string, days = 30) {
	const rows = await prisma.clientUsage.findMany({
		where: { clientId, at: { gte: new Date(Date.now() - days * 86_400_000) } },
		select: { at: true, up: true, down: true },
	})
	const map = new Map<string, { up: number; down: number }>()
	for (let i = days - 1; i >= 0; i--) map.set(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), { up: 0, down: 0 })
	for (const r of rows) {
		const d = map.get(r.at.toISOString().slice(0, 10))
		if (d) {
			d.up += Number(r.up)
			d.down += Number(r.down)
		}
	}
	return [...map.entries()].map(([day, v]) => ({ day, ...v }))
}
