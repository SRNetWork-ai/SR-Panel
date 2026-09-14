/**
 * Unified log — merges audit, notification, webhook, incident and backup rows into a
 * single filterable timeline. No schema change: every source keeps its own table and the
 * streams are merge-sorted in memory.
 */
import { prisma, Prisma } from "@srpanel/db"
import { getLogSettings, type LogSettings } from "./settings"

export const LOG_SOURCES = ["audit", "notification", "webhook", "incident", "backup"] as const
export type LogSource = (typeof LOG_SOURCES)[number]

export const LOG_LEVELS = ["error", "warning", "success", "info"] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

export type UnifiedLogEntry = {
	/** `<source>:<rowId>` — unique across the merged stream */
	id: string
	source: LogSource
	level: LogLevel
	/** ISO timestamp */
	at: string
	action: string
	actor: string | null
	adminId: string | null
	target: string | null
	text: string | null
	ip: string | null
	meta: unknown
}

export type UnifiedLogQuery = {
	sources?: LogSource[]
	levels?: LogLevel[]
	q?: string
	adminId?: string
	from?: string
	to?: string
	skip?: number
	take?: number
}

export type UnifiedLogFacet = { id: LogSource; count: number }
export type UnifiedLogPage = { items: UnifiedLogEntry[]; total: number; facets: UnifiedLogFacet[] }

export type UnifiedLogStats = {
	totals: Record<LogSource, number>
	/** rows written in the last 24h */
	recent: Record<LogSource, number>
	errors24h: number
	total: number
	oldest: string | null
	settings: LogSettings
}

export type PruneLogsResult = { skipped: boolean; audit: number; notification: number; webhook: number; incident: number }

/* ---------------------------------- levels ---------------------------------- */

const SUCCESS_VERBS = ["create", "approve", "fulfill", "enable", "login", "renew", "totp_enabled", "verify", "restore"]
const WARNING_VERBS = ["delete", "disable", "cancel", "reset_traffic", "prune", "cleanup", "logout"]
const ERROR_VERBS = ["login_failed", "failed", "error", "reject"]

/** audit actions are stored as `<category>.<verb>` */
export function auditLevelOf(action: string): LogLevel {
	const verb = action.includes(".") ? action.slice(action.indexOf(".") + 1) : action
	if (ERROR_VERBS.includes(verb)) return "error"
	if (WARNING_VERBS.includes(verb)) return "warning"
	if (SUCCESS_VERBS.includes(verb)) return "success"
	return "info"
}

const verbWhere = (verbs: string[]): Prisma.AuditLogWhereInput[] => verbs.map((v) => ({ action: { endsWith: `.${v}` } }))

/** levels a source can ever produce — used to skip pointless queries */
const SOURCE_LEVELS: Record<LogSource, LogLevel[]> = {
	audit: ["error", "warning", "success", "info"],
	notification: ["error", "info"],
	webhook: ["error", "success", "info"],
	incident: ["error", "success"],
	backup: ["error", "success", "info"],
}

type SourceFilter = { q: string; levels: LogLevel[]; adminId: string; from: string; to: string }

function isActive(source: LogSource, f: SourceFilter): boolean {
	// incidents and backups are system-wide: an admin filter excludes them
	if (f.adminId && (source === "incident" || source === "backup")) return false
	return SOURCE_LEVELS[source].some((l) => f.levels.includes(l))
}

function dateFilter(f: SourceFilter): { gte?: Date; lte?: Date } | null {
	const out: { gte?: Date; lte?: Date } = {}
	if (f.from) {
		const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(f.from) ? `${f.from}T00:00:00` : f.from)
		if (!Number.isNaN(d.getTime())) out.gte = d
	}
	if (f.to) {
		const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(f.to) ? `${f.to}T23:59:59.999` : f.to)
		if (!Number.isNaN(d.getTime())) out.lte = d
	}
	return out.gte || out.lte ? out : null
}

const likeOf = (q: string) => ({ contains: q, mode: "insensitive" as const })

/* ---------------------------------- where ----------------------------------- */

function auditWhere(f: SourceFilter): Prisma.AuditLogWhereInput {
	const and: Prisma.AuditLogWhereInput[] = []
	const at = dateFilter(f)
	if (at) and.push({ at })
	if (f.adminId) and.push({ adminId: f.adminId })
	if (f.q) {
		const like = likeOf(f.q)
		and.push({ OR: [{ action: like }, { target: like }, { ip: like }, { admin: { username: like } }] })
	}
	if (f.levels.length < LOG_LEVELS.length) {
		const or: Prisma.AuditLogWhereInput[] = []
		if (f.levels.includes("error")) or.push(...verbWhere(ERROR_VERBS))
		if (f.levels.includes("warning")) or.push(...verbWhere(WARNING_VERBS))
		if (f.levels.includes("success")) or.push(...verbWhere(SUCCESS_VERBS))
		if (f.levels.includes("info")) or.push({ NOT: { OR: verbWhere([...ERROR_VERBS, ...WARNING_VERBS, ...SUCCESS_VERBS]) } })
		and.push({ OR: or })
	}
	return and.length ? { AND: and } : {}
}

function notifyWhere(f: SourceFilter): Prisma.NotificationLogWhereInput {
	const and: Prisma.NotificationLogWhereInput[] = []
	const at = dateFilter(f)
	if (at) and.push({ at })
	if (f.adminId) and.push({ adminId: f.adminId })
	if (f.q) {
		const like = likeOf(f.q)
		and.push({ OR: [{ kind: like }, { targetId: like }, { error: like }] })
	}
	const wantOk = f.levels.includes("info")
	const wantErr = f.levels.includes("error")
	if (wantOk !== wantErr) and.push({ ok: wantOk })
	return and.length ? { AND: and } : {}
}

const WH_ERROR: Prisma.WebhookDeliveryWhereInput = { OR: [{ NOT: { error: null } }, { status: { gte: 400 } }] }
const WH_OK: Prisma.WebhookDeliveryWhereInput = { error: null, NOT: { doneAt: null }, OR: [{ status: null }, { status: { lt: 400 } }] }
const WH_PENDING: Prisma.WebhookDeliveryWhereInput = { error: null, doneAt: null, OR: [{ status: null }, { status: { lt: 400 } }] }

function webhookWhere(f: SourceFilter): Prisma.WebhookDeliveryWhereInput {
	const and: Prisma.WebhookDeliveryWhereInput[] = []
	const at = dateFilter(f)
	if (at) and.push({ createdAt: at })
	if (f.adminId) and.push({ webhook: { adminId: f.adminId } })
	if (f.q) {
		const like = likeOf(f.q)
		and.push({ OR: [{ event: like }, { error: like }, { webhook: { url: like } }] })
	}
	const or: Prisma.WebhookDeliveryWhereInput[] = []
	if (f.levels.includes("error")) or.push(WH_ERROR)
	if (f.levels.includes("success")) or.push(WH_OK)
	if (f.levels.includes("info")) or.push(WH_PENDING)
	if (or.length < 3) and.push({ OR: or })
	return and.length ? { AND: and } : {}
}

function incidentWhere(f: SourceFilter): Prisma.IncidentWhereInput {
	const and: Prisma.IncidentWhereInput[] = []
	const at = dateFilter(f)
	if (at) and.push({ startedAt: at })
	if (f.q) {
		const like = likeOf(f.q)
		and.push({ OR: [{ message: like }, { server: { name: like } }] })
	}
	const open = f.levels.includes("error")
	const resolved = f.levels.includes("success")
	if (open !== resolved) and.push({ status: open ? "OPEN" : "RESOLVED" })
	return and.length ? { AND: and } : {}
}

function backupWhere(f: SourceFilter): Prisma.BackupWhereInput {
	const and: Prisma.BackupWhereInput[] = []
	const at = dateFilter(f)
	if (at) and.push({ at })
	if (f.q) {
		const like = likeOf(f.q)
		and.push({ OR: [{ fileName: like }, { trigger: like }, { error: like }] })
	}
	const statuses: ("OK" | "FAILED" | "RUNNING")[] = []
	if (f.levels.includes("success")) statuses.push("OK")
	if (f.levels.includes("error")) statuses.push("FAILED")
	if (f.levels.includes("info")) statuses.push("RUNNING")
	if (statuses.length < 3) and.push({ status: { in: statuses } })
	return and.length ? { AND: and } : {}
}

/* ---------------------------------- fetch ----------------------------------- */

function webhookLevel(d: { status: number | null; error: string | null; doneAt: Date | null }): LogLevel {
	if (d.error || (d.status !== null && d.status >= 400)) return "error"
	return d.doneAt ? "success" : "info"
}

async function countOf(source: LogSource, f: SourceFilter): Promise<number> {
	switch (source) {
		case "audit":
			return prisma.auditLog.count({ where: auditWhere(f) })
		case "notification":
			return prisma.notificationLog.count({ where: notifyWhere(f) })
		case "webhook":
			return prisma.webhookDelivery.count({ where: webhookWhere(f) })
		case "incident":
			return prisma.incident.count({ where: incidentWhere(f) })
		case "backup":
			return prisma.backup.count({ where: backupWhere(f) })
		default:
			return 0
	}
}

async function fetchOf(source: LogSource, f: SourceFilter, take: number): Promise<UnifiedLogEntry[]> {
	if (source === "audit") {
		const rows = await prisma.auditLog.findMany({ where: auditWhere(f), orderBy: { at: "desc" }, take, include: { admin: { select: { username: true } } } })
		return rows.map((r) => ({
			id: `audit:${r.id}`,
			source: "audit" as const,
			level: auditLevelOf(r.action),
			at: r.at.toISOString(),
			action: r.action,
			actor: r.admin ? r.admin.username : null,
			adminId: r.adminId ?? null,
			target: r.target ?? null,
			text: null,
			ip: r.ip ?? null,
			meta: r.meta ?? null,
		}))
	}
	if (source === "notification") {
		const rows = await prisma.notificationLog.findMany({ where: notifyWhere(f), orderBy: { at: "desc" }, take })
		return rows.map((r) => ({
			id: `notification:${r.id}`,
			source: "notification" as const,
			level: (r.ok ? "info" : "error") as LogLevel,
			at: r.at.toISOString(),
			action: `notify.${r.kind}`,
			actor: null,
			adminId: r.adminId ?? null,
			target: r.targetId ?? null,
			text: r.error ?? null,
			ip: null,
			meta: { channel: r.channel, kind: r.kind, ok: r.ok, error: r.error, dedupeKey: r.dedupeKey },
		}))
	}
	if (source === "webhook") {
		const rows = await prisma.webhookDelivery.findMany({
			where: webhookWhere(f),
			orderBy: { createdAt: "desc" },
			take,
			include: { webhook: { include: { admin: { select: { username: true } } } } },
		})
		return rows.map((r) => ({
			id: `webhook:${r.id}`,
			source: "webhook" as const,
			level: webhookLevel(r),
			at: r.createdAt.toISOString(),
			action: `webhook.${r.event}`,
			actor: r.webhook && r.webhook.admin ? r.webhook.admin.username : null,
			adminId: r.webhook ? r.webhook.adminId : null,
			target: r.webhook ? r.webhook.url : String(r.webhookId),
			text: r.error ?? (r.status !== null ? `HTTP ${r.status}` : null),
			ip: null,
			meta: { event: r.event, status: r.status, attempts: r.attempts, doneAt: r.doneAt ? r.doneAt.toISOString() : null, error: r.error },
		}))
	}
	if (source === "incident") {
		const rows = await prisma.incident.findMany({ where: incidentWhere(f), orderBy: { startedAt: "desc" }, take, include: { server: { select: { name: true } } } })
		return rows.map((r) => ({
			id: `incident:${r.id}`,
			source: "incident" as const,
			level: (r.status === "OPEN" ? "error" : "success") as LogLevel,
			at: r.startedAt.toISOString(),
			action: `incident.${String(r.kind).toLowerCase()}`,
			actor: null,
			adminId: null,
			target: r.server ? r.server.name : r.serverId,
			text: r.message ?? null,
			ip: null,
			meta: { kind: r.kind, status: r.status, serverId: r.serverId, resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null },
		}))
	}
	const rows = await prisma.backup.findMany({ where: backupWhere(f), orderBy: { at: "desc" }, take })
	return rows.map((r) => ({
		id: `backup:${r.id}`,
		source: "backup" as const,
		level: (r.status === "OK" ? "success" : r.status === "FAILED" ? "error" : "info") as LogLevel,
		at: r.at.toISOString(),
		action: `backup.${r.trigger}`,
		actor: null,
		adminId: null,
		target: r.fileName,
		text: r.error ?? null,
		ip: null,
		meta: {
			status: r.status,
			trigger: r.trigger,
			sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes),
			sentToTelegram: r.sentToTelegram,
			finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
		},
	}))
}

/** NotificationLog has no admin relation — resolve usernames in one extra query. */
async function patchActors(items: UnifiedLogEntry[]): Promise<void> {
	const ids = Array.from(new Set(items.filter((e) => !e.actor && e.adminId).map((e) => e.adminId as string)))
	if (!ids.length) return
	const admins = await prisma.admin.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } })
	const byId = new Map(admins.map((a) => [a.id, a.username]))
	for (const e of items) if (!e.actor && e.adminId) e.actor = byId.get(e.adminId) ?? null
}

const clampInt = (value: unknown, dflt: number, min: number, max: number): number => {
	const n = typeof value === "number" ? value : Number(value)
	if (!Number.isFinite(n)) return dflt
	return Math.min(max, Math.max(min, Math.trunc(n)))
}

/* ---------------------------------- public ---------------------------------- */

export async function unifiedLog(query: UnifiedLogQuery = {}, defaultTake = 200): Promise<UnifiedLogPage> {
	const take = clampInt(query.take, defaultTake, 1, 5000)
	const skip = clampInt(query.skip, 0, 0, 100000)
	const levels = (query.levels ?? []).filter((l) => LOG_LEVELS.includes(l))
	const sources = (query.sources ?? []).filter((s) => LOG_SOURCES.includes(s))
	const f: SourceFilter = {
		q: (query.q ?? "").trim(),
		levels: levels.length ? levels : [...LOG_LEVELS],
		adminId: query.adminId ?? "",
		from: query.from ?? "",
		to: query.to ?? "",
	}
	const wanted: LogSource[] = sources.length ? sources : [...LOG_SOURCES]

	// facets are always computed for every source so the chips stay switchable
	const counts = await Promise.all(LOG_SOURCES.map((s) => (isActive(s, f) ? countOf(s, f) : Promise.resolve(0))))
	const facets: UnifiedLogFacet[] = LOG_SOURCES.map((s, i) => ({ id: s, count: counts[i] ?? 0 }))

	const picked = LOG_SOURCES.filter((s) => wanted.includes(s) && isActive(s, f))
	const window = Math.min(5000, skip + take)
	const chunks = await Promise.all(picked.map((s) => fetchOf(s, f, window)))
	const merged = chunks.flat().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
	const items = merged.slice(skip, skip + take)
	await patchActors(items)
	const total = facets.filter((x) => wanted.includes(x.id)).reduce((n, x) => n + x.count, 0)
	return { items, total, facets }
}

/** UTF-8 CSV with BOM so Excel opens Persian text correctly. */
export function unifiedLogCsv(items: UnifiedLogEntry[]): string {
	const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
	const head = ["at", "source", "level", "action", "actor", "target", "text", "ip", "meta"].join(",")
	const body = items.map((e) =>
		[e.at, e.source, e.level, e.action, e.actor ?? "", e.target ?? "", e.text ?? "", e.ip ?? "", e.meta == null ? "" : JSON.stringify(e.meta)].map(esc).join(","),
	)
	return `\uFEFF${[head, ...body].join("\r\n")}`
}

export async function unifiedLogStats(): Promise<UnifiedLogStats> {
	const since = new Date(Date.now() - 86400000)
	const auditErrors: Prisma.AuditLogWhereInput = { OR: verbWhere(ERROR_VERBS) }
	const [totals, recent, errors, oldest, settings] = await Promise.all([
		Promise.all([prisma.auditLog.count(), prisma.notificationLog.count(), prisma.webhookDelivery.count(), prisma.incident.count(), prisma.backup.count()]),
		Promise.all([
			prisma.auditLog.count({ where: { at: { gte: since } } }),
			prisma.notificationLog.count({ where: { at: { gte: since } } }),
			prisma.webhookDelivery.count({ where: { createdAt: { gte: since } } }),
			prisma.incident.count({ where: { startedAt: { gte: since } } }),
			prisma.backup.count({ where: { at: { gte: since } } }),
		]),
		Promise.all([
			prisma.auditLog.count({ where: { AND: [{ at: { gte: since } }, auditErrors] } }),
			prisma.notificationLog.count({ where: { at: { gte: since }, ok: false } }),
			prisma.webhookDelivery.count({ where: { AND: [{ createdAt: { gte: since } }, WH_ERROR] } }),
			prisma.incident.count({ where: { startedAt: { gte: since }, status: "OPEN" } }),
			prisma.backup.count({ where: { at: { gte: since }, status: "FAILED" } }),
		]),
		prisma.auditLog.findFirst({ orderBy: { at: "asc" }, select: { at: true } }),
		getLogSettings(),
	])
	const keyed = (n: number[]): Record<LogSource, number> => ({ audit: n[0] ?? 0, notification: n[1] ?? 0, webhook: n[2] ?? 0, incident: n[3] ?? 0, backup: n[4] ?? 0 })
	return {
		totals: keyed(totals),
		recent: keyed(recent),
		errors24h: errors.reduce((a, b) => a + b, 0),
		total: totals.reduce((a, b) => a + b, 0),
		oldest: oldest ? oldest.at.toISOString() : null,
		settings,
	}
}

/**
 * Retention: drops rows older than the configured window. `0` keeps a source forever.
 * Backup rows are never touched here — the backup retention settings own those files.
 */
export async function pruneLogs(opts: { force?: boolean } = {}): Promise<PruneLogsResult> {
	const s = await getLogSettings()
	const out: PruneLogsResult = { skipped: false, audit: 0, notification: 0, webhook: 0, incident: 0 }
	if (!s.autoPrune && !opts.force) {
		out.skipped = true
		return out
	}
	const cut = (days: number) => new Date(Date.now() - days * 86400000)
	if (s.auditKeepDays > 0) out.audit = (await prisma.auditLog.deleteMany({ where: { at: { lt: cut(s.auditKeepDays) } } })).count
	if (s.notifyKeepDays > 0) out.notification = (await prisma.notificationLog.deleteMany({ where: { at: { lt: cut(s.notifyKeepDays) } } })).count
	if (s.webhookKeepDays > 0) out.webhook = (await prisma.webhookDelivery.deleteMany({ where: { createdAt: { lt: cut(s.webhookKeepDays) }, NOT: { doneAt: null } } })).count
	if (s.incidentKeepDays > 0) out.incident = (await prisma.incident.deleteMany({ where: { startedAt: { lt: cut(s.incidentKeepDays) }, status: "RESOLVED" } })).count
	return out
}
