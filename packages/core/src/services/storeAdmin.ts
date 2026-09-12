import { prisma, type Admin, type Order } from "@srpanel/db"
import { ForbiddenError, NotFoundError } from "../util/errors"
import { enabledMethods, storeUrlFor } from "./storeSettings"

/** Admin/owner side of the store: order lists and the dashboard summary. */

function orderScope(actor: Pick<Admin, "id" | "role">) {
	return actor.role === "OWNER" ? {} : { adminId: actor.id }
}

export async function listOrders(actor: Pick<Admin, "id" | "role">, opts: { status?: string; q?: string; take?: number; skip?: number } = {}) {
	const take = Math.min(200, Math.max(1, opts.take ?? 50))
	const skip = Math.max(0, opts.skip ?? 0)
	const q = opts.q?.trim()
	const where = {
		...orderScope(actor),
		...(opts.status ? { status: opts.status as Order["status"] } : {}),
		...(q
			? { OR: [{ customerName: { contains: q, mode: "insensitive" as const } }, { customerTelegramId: { contains: q } }, { customerPhone: { contains: q } }, { id: { endsWith: q } }, { token: q }] }
			: {}),
	}
	const [items, total] = await Promise.all([
		prisma.order.findMany({
			where,
			orderBy: { createdAt: "desc" },
			take,
			skip,
			include: { plan: { select: { name: true } }, client: { select: { id: true, name: true } }, admin: { select: { username: true } }, payments: { orderBy: { createdAt: "desc" }, take: 1 } },
		}),
		prisma.order.count({ where }),
	])
	return { items, total }
}

export async function orderForActor(actor: Pick<Admin, "id" | "role">, id: string) {
	const o = await prisma.order.findUnique({ where: { id }, include: { plan: true, client: true, payments: { orderBy: { createdAt: "desc" } }, admin: { select: { username: true } } } })
	if (!o) throw new NotFoundError("سفارش پیدا نشد")
	if (actor.role !== "OWNER" && o.adminId !== actor.id) throw new ForbiddenError()
	return o
}

export async function storeOverview(actor: Admin) {
	const since = new Date(Date.now() - 30 * 86_400_000)
	const scope = orderScope(actor)
	const [settings, brand, byStatus, revenue, pendingReview, plans, recent] = await Promise.all([
		prisma.storeSettings.findUnique({ where: { adminId: actor.id } }),
		prisma.brand.findUnique({ where: { adminId: actor.id } }),
		prisma.order.groupBy({ by: ["status"], where: { ...scope, createdAt: { gte: since } }, _count: { _all: true } }),
		prisma.order.aggregate({ where: { ...scope, status: { in: ["PAID", "FULFILLED"] }, createdAt: { gte: since } }, _sum: { amount: true } }),
		prisma.payment.count({ where: { ...(actor.role === "OWNER" ? {} : { adminId: actor.id, kind: "ORDER" }), status: "REVIEW" } }),
		prisma.plan.count({ where: { adminId: actor.id, isActive: true } }),
		prisma.order.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 8, include: { plan: { select: { name: true } } } }),
	])
	const counts: Record<string, number> = {}
	for (const r of byStatus) counts[r.status] = r._count._all
	return {
		enabled: settings?.enabled ?? false,
		slug: settings?.slug ?? null,
		url: settings ? storeUrlFor(settings, brand?.customDomain) : null,
		methods: settings ? enabledMethods(settings) : [],
		counts,
		revenue30d: revenue._sum.amount ?? 0n,
		pendingReview,
		activePlans: plans,
		recent,
	}
}
