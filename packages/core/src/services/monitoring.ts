/**
 * Monitoring: incident detection (offline / auth error / xray down / high CPU), uptime and overview data.
 */
import { prisma, type Incident, type IncidentKind, type Server } from "@srpanel/db"
import { NotFoundError } from "../util/errors"
import { fmtDate, fmtDuration, notify } from "./notifications"
import { getMonitoringSettings, getTelegramSettings } from "./settings"
import { tgEscape } from "./telegram"
import { emitEvent } from "./webhooks"

export const INCIDENT_LABEL: Record<IncidentKind, { fa: string; en: string; emoji: string }> = {
	OFFLINE: { fa: "سرور آفلاین شد", en: "Server offline", emoji: "🔴" },
	AUTH_ERROR: { fa: "خطای ورود به پنل سرور", en: "Panel authentication failed", emoji: "🟠" },
	XRAY_DOWN: { fa: "سرویس Xray متوقف است", en: "Xray is not running", emoji: "🟣" },
	HIGH_CPU: { fa: "مصرف CPU بالا", en: "High CPU usage", emoji: "🟡" },
}

type ServerLite = Pick<Server, "id" | "name" | "status" | "lastError">

async function openIncident(server: ServerLite, kind: IncidentKind, message?: string | null): Promise<Incident> {
	const inc = await prisma.incident.create({ data: { serverId: server.id, kind, message: message ? message.slice(0, 500) : null } })
	const label = INCIDENT_LABEL[kind]
	const text = `${label.emoji} <b>${label.fa}</b>\n🖥 ${tgEscape(server.name)}\n🕒 ${fmtDate(inc.startedAt)}${message ? `\n❗️ <code>${tgEscape(message.slice(0, 200))}</code>` : ""}`
	const s = await getTelegramSettings()
	if (s.notifyIncidents) {
		const ok = await notify("server.incident_opened", text, { dedupeKey: `incident.open:${inc.id}`, targetId: server.id, recipients: { ownerOnly: true } })
		if (ok) await prisma.incident.update({ where: { id: inc.id }, data: { notifiedAt: new Date() } })
	}
	await emitEvent(null, "server.incident_opened", { target: server.id, server: { id: server.id, name: server.name }, incident: { id: inc.id, kind, message: inc.message, startedAt: inc.startedAt.toISOString() } })
	return inc
}

async function resolveIncident(inc: Incident, server: ServerLite, manual = false): Promise<Incident> {
	const resolvedAt = new Date()
	const updated = await prisma.incident.update({ where: { id: inc.id }, data: { status: "RESOLVED", resolvedAt } })
	const label = INCIDENT_LABEL[inc.kind]
	const text = `🟢 <b>رفع شد: ${label.fa}</b>\n🖥 ${tgEscape(server.name)}\n⏳ مدت: ${fmtDuration(resolvedAt.getTime() - inc.startedAt.getTime())}${manual ? "\n👤 به صورت دستی بسته شد" : ""}`
	const s = await getTelegramSettings()
	if (s.notifyIncidents) await notify("server.incident_resolved", text, { dedupeKey: `incident.resolve:${inc.id}`, targetId: server.id, recipients: { ownerOnly: true } })
	await emitEvent(null, "server.incident_resolved", { target: server.id, server: { id: server.id, name: server.name }, incident: { id: inc.id, kind: inc.kind, startedAt: inc.startedAt.toISOString(), resolvedAt: resolvedAt.toISOString(), manual } })
	return updated
}

/** Worker job — run after each sync round. */
export async function evaluateIncidents(): Promise<{ opened: number; resolved: number }> {
	const m = await getMonitoringSettings()
	const out = { opened: 0, resolved: 0 }
	const servers = await prisma.server.findMany({ where: { isActive: true }, include: { incidents: { where: { status: "OPEN" } } } })
	for (const s of servers) {
		const recent = await prisma.serverMetric.findMany({ where: { serverId: s.id }, orderBy: { at: "desc" }, take: Math.max(m.failThreshold, 3) })
		if (!recent.length) continue
		const latest = recent[0]!
		const open = (kind: IncidentKind) => s.incidents.find((i) => i.kind === kind)
		const lastN = recent.slice(0, m.failThreshold)
		const down = lastN.length >= m.failThreshold && lastN.every((r) => !r.online)

		if (down) {
			if (!open("OFFLINE") && !open("AUTH_ERROR")) {
				await openIncident(s, s.status === "AUTH_ERROR" ? "AUTH_ERROR" : "OFFLINE", s.lastError)
				out.opened++
			}
		} else if (latest.online) {
			for (const kind of ["OFFLINE", "AUTH_ERROR"] as IncidentKind[]) {
				const i = open(kind)
				if (i) {
					await resolveIncident(i, s)
					out.resolved++
				}
			}
		}

		if (latest.online) {
			const xrayDown = !!latest.xrayState && latest.xrayState !== "running"
			const xi = open("XRAY_DOWN")
			if (xrayDown && !xi) {
				await openIncident(s, "XRAY_DOWN", `xray: ${latest.xrayState}`)
				out.opened++
			} else if (!xrayDown && xi) {
				await resolveIncident(xi, s)
				out.resolved++
			}

			const last3 = recent.slice(0, 3)
			const cpuHigh = last3.length === 3 && last3.every((r) => (r.cpu ?? 0) >= m.cpuThreshold)
			const ci = open("HIGH_CPU")
			if (cpuHigh && !ci) {
				await openIncident(s, "HIGH_CPU", `CPU ${Math.round(latest.cpu ?? 0)}%`)
				out.opened++
			} else if (ci && (latest.cpu ?? 0) < Math.max(0, m.cpuThreshold - 10)) {
				await resolveIncident(ci, s)
				out.resolved++
			}
		}
	}
	return out
}

export async function resolveIncidentManually(id: string): Promise<Incident> {
	const inc = await prisma.incident.findUnique({ where: { id }, include: { server: true } })
	if (!inc) throw new NotFoundError("رخداد پیدا نشد")
	if (inc.status === "RESOLVED") return inc
	return resolveIncident(inc, inc.server, true)
}

export async function listIncidents(opts: { status?: "OPEN" | "RESOLVED"; take?: number; skip?: number } = {}) {
	const where = opts.status ? { status: opts.status } : {}
	const [items, total] = await Promise.all([
		prisma.incident.findMany({ where, orderBy: [{ status: "asc" }, { startedAt: "desc" }], take: opts.take ?? 50, skip: opts.skip ?? 0, include: { server: { select: { id: true, name: true } } } }),
		prisma.incident.count({ where }),
	])
	return { items, total }
}

/** Percentage of successful checks per server in the last N hours. */
export async function uptimeSummary(hours: number): Promise<Record<string, number | null>> {
	const since = new Date(Date.now() - hours * 3_600_000)
	const [total, online] = await Promise.all([
		prisma.serverMetric.groupBy({ by: ["serverId"], where: { at: { gte: since } }, _count: { _all: true } }),
		prisma.serverMetric.groupBy({ by: ["serverId"], where: { at: { gte: since }, online: true }, _count: { _all: true } }),
	])
	const onlineMap = new Map(online.map((r) => [r.serverId, r._count._all]))
	const out: Record<string, number | null> = {}
	for (const r of total) out[r.serverId] = r._count._all ? Math.round(((onlineMap.get(r.serverId) ?? 0) / r._count._all) * 1000) / 10 : null
	return out
}

export interface MonitoringOverview {
	summary: { servers: number; online: number; openIncidents: number; uptime24: number | null; uptime7d: number | null }
	servers: Array<{
		id: string
		name: string
		status: string
		lastSeenAt: string | null
		lastError: string | null
		uptime24: number | null
		uptime7d: number | null
		latencyMs: number | null
		cpu: number | null
		memPct: number | null
		xrayState: string | null
		clients: number
		openIncidents: number
		latency: Array<{ at: string; value: number | null }>
	}>
	incidents: Array<{ id: string; serverId: string; serverName: string; kind: IncidentKind; status: string; message: string | null; startedAt: string; resolvedAt: string | null }>
}

function downsample<T>(rows: T[], max: number): T[] {
	if (rows.length <= max) return rows
	const step = rows.length / max
	const out: T[] = []
	for (let i = 0; i < max; i++) out.push(rows[Math.floor(i * step)]!)
	return out
}

export async function monitoringOverview(): Promise<MonitoringOverview> {
	const [servers, up24, up7, incidents] = await Promise.all([
		prisma.server.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { clients: true, incidents: { where: { status: "OPEN" } } } } } }),
		uptimeSummary(24),
		uptimeSummary(24 * 7),
		prisma.incident.findMany({ orderBy: [{ status: "asc" }, { startedAt: "desc" }], take: 30, include: { server: { select: { name: true } } } }),
	])
	const since = new Date(Date.now() - 24 * 3_600_000)
	const list: MonitoringOverview["servers"] = []
	for (const s of servers) {
		const metrics = await prisma.serverMetric.findMany({ where: { serverId: s.id, at: { gte: since } }, orderBy: { at: "asc" }, select: { at: true, online: true, latencyMs: true, cpu: true, memUsed: true, memTotal: true, xrayState: true } })
		const latest = metrics[metrics.length - 1]
		list.push({
			id: s.id,
			name: s.name,
			status: s.status,
			lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
			lastError: s.lastError,
			uptime24: up24[s.id] ?? null,
			uptime7d: up7[s.id] ?? null,
			latencyMs: latest?.latencyMs ?? null,
			cpu: latest?.cpu ?? null,
			memPct: latest?.memTotal && latest.memTotal > 0n ? Math.round((Number(latest.memUsed ?? 0n) / Number(latest.memTotal)) * 100) : null,
			xrayState: latest?.xrayState ?? null,
			clients: s._count.clients,
			openIncidents: s._count.incidents,
			latency: downsample(metrics, 60).map((m) => ({ at: m.at.toISOString(), value: m.online ? m.latencyMs : null })),
		})
	}
	const withUptime24 = list.filter((s) => s.uptime24 !== null)
	const withUptime7 = list.filter((s) => s.uptime7d !== null)
	const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
	return {
		summary: {
			servers: servers.length,
			online: servers.filter((s) => s.status === "ONLINE").length,
			openIncidents: incidents.filter((i) => i.status === "OPEN").length,
			uptime24: avg(withUptime24.map((s) => s.uptime24 as number)),
			uptime7d: avg(withUptime7.map((s) => s.uptime7d as number)),
		},
		servers: list,
		incidents: incidents.map((i) => ({ id: i.id, serverId: i.serverId, serverName: i.server.name, kind: i.kind, status: i.status, message: i.message, startedAt: i.startedAt.toISOString(), resolvedAt: i.resolvedAt?.toISOString() ?? null })),
	}
}
