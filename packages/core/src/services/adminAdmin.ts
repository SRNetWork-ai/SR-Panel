/**
 * Advanced reseller management (stage 4): the one-admin detail view (quota vs.
 * allocation, client mix, granted services, inbound access, wallet ledger and
 * audit trail) plus bulk actions over many admins at once.
 *
 * All numbers are plain JS numbers, so route handlers can return the result as-is.
 */
import { prisma, type Admin } from "@srpanel/db"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { listAdmins, updateAdmin, type AdminInput } from "./admins"
import { audit } from "./audit"
import { inboundsOf } from "./servers"
import { serviceTargets } from "./services"

type AdminListRow = Awaited<ReturnType<typeof listAdmins>>[number]

const DAY = 86_400_000
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)
const pct = (used: number, total: number | null): number | null => (total && total > 0 ? Math.min(999, Math.round((used / total) * 100)) : null)

export interface AdminClientRow {
	id: string
	name: string
	status: string
	trafficLimit: number
	used: number
	usagePct: number | null
	expiresAt: string | null
	daysLeft: number | null
	lastOnlineAt: string | null
	createdAt: string
	serviceName: string | null
	servers: number
}

export interface AdminServiceRow {
	id: string
	name: string
	isActive: boolean
	isPublic: boolean
	targets: number
}

export interface AdminAccessRow {
	serverId: string
	serverName: string
	serverStatus: string
	inboundIds: number[]
	inboundLabels: string[]
}

export interface AdminAuditRow {
	id: string
	at: string
	action: string
	target: string | null
	ip: string | null
}

export interface AdminWalletRow {
	id: string
	kind: string
	amount: number
	balanceAfter: number
	note: string | null
	createdAt: string
}

export interface AdminDetail {
	id: string
	username: string
	displayName: string | null
	role: string
	isActive: boolean
	createdAt: string
	expiresAt: string | null
	daysLeft: number | null
	telegramId: string | null
	lastLoginAt: string | null
	lastLoginIp: string | null
	totpEnabled: boolean
	credit: number
	trafficQuota: number | null
	clientLimit: number | null
	quota: { allocated: number; used: number; allocatedPct: number | null; usedPct: number | null; remaining: number | null }
	clients: { total: number; active: number; disabled: number; expired: number; limited: number; limitPct: number | null }
	services: AdminServiceRow[]
	access: AdminAccessRow[]
	topClients: AdminClientRow[]
	recentClients: AdminClientRow[]
	wallet: AdminWalletRow[]
	audit: AdminAuditRow[]
}

function assertOwner(actor: Pick<Admin, "role">): void {
	if (actor.role !== "OWNER") throw new ForbiddenError("فقط مالک پنل مجاز است")
}

/** Everything the reseller detail screen shows, in one query round. */
export async function adminDetail(actor: Pick<Admin, "id" | "role">, id: string): Promise<AdminDetail> {
	assertOwner(actor)
	const admin = await prisma.admin.findUnique({ where: { id }, include: { serverAccess: { select: { serverId: true, inboundIds: true } } } })
	if (!admin) throw new NotFoundError("ادمین پیدا نشد")

	const [byStatus, sums, topRaw, recentRaw, services, servers, auditRows, walletRows] = await Promise.all([
		prisma.client.groupBy({ by: ["status"], where: { adminId: id }, _count: { _all: true } }),
		prisma.client.aggregate({ where: { adminId: id }, _sum: { trafficLimit: true, usedUp: true, usedDown: true } }),
		prisma.client.findMany({ where: { adminId: id }, orderBy: { usedDown: "desc" }, take: 25, include: { _count: { select: { servers: true } } } }),
		prisma.client.findMany({ where: { adminId: id }, orderBy: { createdAt: "desc" }, take: 10, include: { _count: { select: { servers: true } } } }),
		prisma.service.findMany({ select: { id: true, name: true, isActive: true, adminIds: true, targets: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
		prisma.server.findMany(),
		prisma.auditLog.findMany({ where: { adminId: id }, orderBy: { at: "desc" }, take: 20 }),
		prisma.walletTx.findMany({ where: { adminId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
	])

	const serviceName = new Map(services.map((s) => [s.id, s.name] as const))
	const toRow = (c: (typeof topRaw)[number]): AdminClientRow => {
		const limit = Number(c.trafficLimit)
		const used = Number(c.usedUp) + Number(c.usedDown)
		return {
			id: c.id,
			name: c.name,
			status: String(c.status),
			trafficLimit: limit,
			used,
			usagePct: pct(used, limit),
			expiresAt: iso(c.expiresAt),
			daysLeft: c.expiresAt ? Math.ceil((c.expiresAt.getTime() - Date.now()) / DAY) : null,
			lastOnlineAt: iso(c.lastOnlineAt),
			createdAt: c.createdAt.toISOString(),
			serviceName: c.serviceId ? serviceName.get(c.serviceId) ?? null : null,
			servers: c._count.servers,
		}
	}

	const statusCount = (s: string): number => byStatus.find((x) => String(x.status) === s)?._count._all ?? 0
	const total = byStatus.reduce((acc, x) => acc + x._count._all, 0)
	const allocated = Number(sums._sum.trafficLimit ?? 0n)
	const used = Number(sums._sum.usedUp ?? 0n) + Number(sums._sum.usedDown ?? 0n)
	const quotaBytes = admin.trafficQuota === null ? null : Number(admin.trafficQuota)

	const access: AdminAccessRow[] = admin.serverAccess.map((row) => {
		const server = servers.find((s) => s.id === row.serverId)
		const list = server ? inboundsOf(server) : []
		const pick = row.inboundIds.length ? row.inboundIds : list.map((ib) => ib.id)
		const labels = pick.map((iid) => {
			const ib = list.find((x) => x.id === iid)
			return ib ? ib.protocol + ":" + ib.port : "#" + iid
		})
		return {
			serverId: row.serverId,
			serverName: server?.name ?? "—",
			serverStatus: server ? String(server.status) : "UNKNOWN",
			inboundIds: row.inboundIds,
			inboundLabels: labels,
		}
	})

	return {
		id: admin.id,
		username: admin.username,
		displayName: admin.displayName,
		role: String(admin.role),
		isActive: admin.isActive,
		createdAt: admin.createdAt.toISOString(),
		expiresAt: iso(admin.expiresAt),
		daysLeft: admin.expiresAt ? Math.ceil((admin.expiresAt.getTime() - Date.now()) / DAY) : null,
		telegramId: admin.telegramId,
		lastLoginAt: iso(admin.lastLoginAt),
		lastLoginIp: admin.lastLoginIp,
		totpEnabled: admin.totpEnabled,
		credit: Number(admin.credit),
		trafficQuota: quotaBytes,
		clientLimit: admin.clientLimit,
		quota: {
			allocated,
			used,
			allocatedPct: pct(allocated, quotaBytes),
			usedPct: pct(used, quotaBytes),
			remaining: quotaBytes === null ? null : quotaBytes - allocated,
		},
		clients: {
			total,
			active: statusCount("ACTIVE"),
			disabled: statusCount("DISABLED"),
			expired: statusCount("EXPIRED"),
			limited: statusCount("LIMITED"),
			limitPct: pct(total, admin.clientLimit),
		},
		services: services
			.filter((s) => s.adminIds.length === 0 || s.adminIds.includes(id))
			.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive, isPublic: s.adminIds.length === 0, targets: serviceTargets(s).length })),
		access,
		topClients: topRaw
			.map(toRow)
			.sort((a, b) => b.used - a.used)
			.slice(0, 10),
		recentClients: recentRaw.map(toRow),
		wallet: walletRows.map((w) => ({
			id: w.id,
			kind: String(w.kind),
			amount: Number(w.amount),
			balanceAfter: Number(w.balanceAfter),
			note: w.note,
			createdAt: w.createdAt.toISOString(),
		})),
		audit: auditRows.map((a) => ({ id: String(a.id), at: a.at.toISOString(), action: a.action, target: a.target, ip: a.ip })),
	}
}

export type AdminBulkAction = "activate" | "deactivate" | "extend" | "quota" | "clientLimit"

export interface AdminBulkInput {
	ids: string[]
	action: AdminBulkAction
	/** extend: days added to the later of «now» and the current expiry */
	days?: number
	/** quota: GB, null = unlimited */
	quotaGB?: number | null
	/** clientLimit: null = unlimited */
	clientLimit?: number | null
}

export interface AdminBulkResult {
	total: number
	updated: number
	skipped: Array<{ id: string; username: string; reason: string }>
	/** fresh rows of the admins that were changed */
	admins: AdminListRow[]
}

/**
 * Applies one action to many resellers. The owner row is always skipped and
 * every change goes through updateAdmin(), so session revoking and the audit
 * log keep working exactly like a single edit.
 */
export async function bulkAdminAction(actor: Admin, input: AdminBulkInput): Promise<AdminBulkResult> {
	assertOwner(actor)
	const ids = [...new Set(input.ids.map((x) => x.trim()).filter(Boolean))]
	if (!ids.length) throw new AppError("هیچ ادمینی انتخاب نشده است")
	if (ids.length > 100) throw new AppError("حداکثر ۱۰۰ ادمین در هر عملیات")
	const days = Math.round(input.days ?? 0)
	if (input.action === "extend" && (days === 0 || days < -3650 || days > 3650)) throw new AppError("تعداد روز معتبر نیست")

	const targets = await prisma.admin.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, role: true, expiresAt: true } })
	const skipped: AdminBulkResult["skipped"] = []
	const touched: string[] = []

	for (const id of ids) {
		const target = targets.find((x) => x.id === id)
		if (!target) {
			skipped.push({ id, username: "—", reason: "not_found" })
			continue
		}
		if (target.role === "OWNER") {
			skipped.push({ id, username: target.username, reason: "owner" })
			continue
		}
		let patch: Partial<AdminInput>
		if (input.action === "activate") patch = { isActive: true }
		else if (input.action === "deactivate") patch = { isActive: false }
		else if (input.action === "extend") {
			const base = target.expiresAt && target.expiresAt.getTime() > Date.now() ? target.expiresAt.getTime() : Date.now()
			patch = { expiresAt: new Date(base + days * DAY).toISOString() }
		} else if (input.action === "quota") patch = { trafficQuotaGB: input.quotaGB === undefined ? null : input.quotaGB }
		else patch = { clientLimit: input.clientLimit === undefined ? null : input.clientLimit }

		try {
			await updateAdmin(actor, id, patch)
			touched.push(id)
		} catch (err) {
			skipped.push({ id, username: target.username, reason: err instanceof Error ? err.message : "error" })
		}
	}

	const rows = await listAdmins(actor)
	await audit(actor.id, "admin.bulk." + input.action, undefined, { updated: touched.length, skipped: skipped.length, days: input.action === "extend" ? days : undefined })
	return { total: ids.length, updated: touched.length, skipped, admins: rows.filter((a) => touched.includes(a.id)) }
}
