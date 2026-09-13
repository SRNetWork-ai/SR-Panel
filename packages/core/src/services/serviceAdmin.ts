/**
 * Advanced service management (stage 4): a health overview of every service —
 * which targets are broken and why, how many clients ride on them and how much
 * traffic they carry — plus duplicate & reorder helpers.
 *
 * Everything returned here is JSON-safe (BigInt columns become numbers) so a
 * route handler can hand it straight to the UI.
 */
import { prisma, type Admin } from "@srpanel/db"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { inboundsOf } from "./servers"
import { serviceTargets } from "./services"

/** Why one target (server + inbound) of a service is unusable right now. */
export type ServiceIssue = "SERVER_MISSING" | "SERVER_INACTIVE" | "INBOUND_MISSING" | "INBOUND_DISABLED" | "SERVER_OFFLINE"

export interface ServiceTargetHealth {
	serverId: string
	serverName: string
	serverStatus: string
	inboundId: number
	inboundLabel: string
	/** true = nothing wrong with this target */
	ok: boolean
	issue: ServiceIssue | null
	/** clients provisioned on this exact inbound (across all services) */
	clients: number
	up: number
	down: number
}

export interface ServiceOverviewRow {
	id: string
	name: string
	description: string | null
	isActive: boolean
	sortOrder: number
	createdAt: string
	updatedAt: string
	adminIds: string[]
	adminNames: string[]
	/** no admin selected = every admin may use it */
	isPublic: boolean
	targets: number
	healthy: number
	/** targets with a configuration problem the owner has to fix */
	broken: number
	/** targets whose server is merely offline at the moment */
	offline: number
	servers: number
	clients: number
	activeClients: number
	up: number
	down: number
	targetHealth: ServiceTargetHealth[]
}

export interface ServicesOverview {
	totals: { services: number; active: number; broken: number; clients: number; traffic: number }
	services: ServiceOverviewRow[]
}

function assertOwner(actor: Pick<Admin, "role">): void {
	if (actor.role !== "OWNER") throw new ForbiddenError("فقط مالک پنل مجاز است")
}

function issueOf(server: { isActive: boolean; status: string } | undefined, inbound: { enable?: boolean } | undefined): ServiceIssue | null {
	if (!server) return "SERVER_MISSING"
	if (!server.isActive) return "SERVER_INACTIVE"
	if (!inbound) return "INBOUND_MISSING"
	if (inbound.enable === false) return "INBOUND_DISABLED"
	if (server.status !== "ONLINE") return "SERVER_OFFLINE"
	return null
}

/** Health + usage of every service — the data behind the owner's services screen. */
export async function servicesOverview(actor: Pick<Admin, "id" | "role">): Promise<ServicesOverview> {
	assertOwner(actor)
	const [services, servers, admins, byService, activeByService, byTarget] = await Promise.all([
		prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
		prisma.server.findMany(),
		prisma.admin.findMany({ select: { id: true, username: true, displayName: true } }),
		prisma.client.groupBy({ by: ["serviceId"], _count: { _all: true }, _sum: { usedUp: true, usedDown: true } }),
		prisma.client.groupBy({ by: ["serviceId"], where: { status: "ACTIVE" }, _count: { _all: true } }),
		prisma.clientServer.groupBy({ by: ["serverId", "inboundId"], _count: { _all: true }, _sum: { up: true, down: true } }),
	])

	const adminName = new Map(admins.map((a) => [a.id, a.displayName || a.username] as const))
	const targetAgg = new Map<string, { clients: number; up: number; down: number }>()
	for (const row of byTarget) {
		targetAgg.set(row.serverId + ":" + row.inboundId, { clients: row._count._all, up: Number(row._sum.up ?? 0n), down: Number(row._sum.down ?? 0n) })
	}

	const rows: ServiceOverviewRow[] = services.map((service) => {
		const targetHealth: ServiceTargetHealth[] = serviceTargets(service).map((t) => {
			const server = servers.find((s) => s.id === t.serverId)
			const inbound = server ? inboundsOf(server).find((i) => i.id === t.inboundId) : undefined
			const issue = issueOf(server, inbound)
			const agg = targetAgg.get(t.serverId + ":" + t.inboundId) ?? { clients: 0, up: 0, down: 0 }
			const label = inbound ? inbound.protocol + ":" + inbound.port + (inbound.remark ? " • " + inbound.remark : "") : "#" + t.inboundId
			return {
				serverId: t.serverId,
				serverName: server?.name ?? "—",
				serverStatus: server ? String(server.status) : "UNKNOWN",
				inboundId: t.inboundId,
				inboundLabel: label,
				ok: issue === null,
				issue,
				clients: agg.clients,
				up: agg.up,
				down: agg.down,
			}
		})
		const usage = byService.find((x) => x.serviceId === service.id)
		const active = activeByService.find((x) => x.serviceId === service.id)
		return {
			id: service.id,
			name: service.name,
			description: service.description,
			isActive: service.isActive,
			sortOrder: service.sortOrder,
			createdAt: service.createdAt.toISOString(),
			updatedAt: service.updatedAt.toISOString(),
			adminIds: service.adminIds,
			adminNames: service.adminIds.map((id) => adminName.get(id) ?? "—"),
			isPublic: service.adminIds.length === 0,
			targets: targetHealth.length,
			healthy: targetHealth.filter((x) => x.ok).length,
			broken: targetHealth.filter((x) => x.issue !== null && x.issue !== "SERVER_OFFLINE").length,
			offline: targetHealth.filter((x) => x.issue === "SERVER_OFFLINE").length,
			servers: new Set(targetHealth.map((x) => x.serverId)).size,
			clients: usage?._count._all ?? 0,
			activeClients: active?._count._all ?? 0,
			up: Number(usage?._sum.usedUp ?? 0n),
			down: Number(usage?._sum.usedDown ?? 0n),
			targetHealth,
		}
	})

	return {
		totals: {
			services: rows.length,
			active: rows.filter((r) => r.isActive).length,
			broken: rows.filter((r) => r.broken > 0 || r.targets === 0).length,
			clients: rows.reduce((s, r) => s + r.clients, 0),
			traffic: rows.reduce((s, r) => s + r.up + r.down, 0),
		},
		services: rows,
	}
}

/**
 * Clones a service (same inbounds and admin access) as a disabled copy, so the
 * owner can tweak it before resellers see it.
 */
export async function duplicateService(actor: Admin, id: string, name?: string): Promise<{ id: string; name: string }> {
	assertOwner(actor)
	const src = await prisma.service.findUnique({ where: { id } })
	if (!src) throw new NotFoundError("سرویس پیدا نشد")
	const targets = serviceTargets(src)
	const copyName = (name ?? "").trim() || src.name + " (کپی)"
	const created = await prisma.service.create({
		data: {
			ownerId: actor.id,
			name: copyName,
			description: src.description,
			targets: targets as unknown as object,
			adminIds: src.adminIds,
			isActive: false,
			sortOrder: src.sortOrder + 1,
		},
	})
	await audit(actor.id, "service.duplicate", created.id, { from: src.id, name: copyName, targets: targets.length })
	return { id: created.id, name: created.name }
}

/** Writes the given id order into sortOrder (0..n-1). Unknown ids are ignored. */
export async function reorderServices(actor: Admin, ids: string[]): Promise<Array<{ id: string; sortOrder: number }>> {
	assertOwner(actor)
	const wanted = [...new Set(ids.map((x) => x.trim()).filter(Boolean))]
	if (!wanted.length) throw new AppError("ترتیب جدید خالی است")
	const existing = await prisma.service.findMany({ where: { id: { in: wanted } }, select: { id: true } })
	const known = new Set(existing.map((s) => s.id))
	const order = wanted.filter((id) => known.has(id))
	if (!order.length) throw new NotFoundError("سرویسی برای مرتب‌سازی پیدا نشد")
	await prisma.$transaction(order.map((id, i) => prisma.service.update({ where: { id }, data: { sortOrder: i } })))
	await audit(actor.id, "service.reorder", undefined, { count: order.length })
	return order.map((id, i) => ({ id, sortOrder: i }))
}
