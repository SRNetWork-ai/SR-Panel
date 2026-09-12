import { prisma } from "@srpanel/db"
import { ok, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

const like = (q: string) => ({ contains: q, mode: "insensitive" as const })

export const GET = route(async (req) => {
	await requireOwner()
	const sp = req.nextUrl.searchParams
	const take = Math.min(200, Math.max(1, Number(sp.get("take") ?? 50)))
	const skip = Math.max(0, Number(sp.get("skip") ?? 0))
	const q = sp.get("q")?.trim()
	const category = sp.get("category")?.trim()
	const from = sp.get("from")?.trim()
	const to = sp.get("to")?.trim()

	/** `withCategory: false` keeps the facet counts switchable while a category is selected */
	const buildWhere = (withCategory: boolean) => ({
		AND: [
			...(q ? [{ OR: [{ action: like(q) }, { target: like(q) }, { ip: like(q) }, { admin: { username: like(q) } }] }] : []),
			...(withCategory && category ? [{ action: { startsWith: `${category}.` } }] : []),
			...(from ? [{ at: { gte: new Date(`${from}T00:00:00.000`) } }] : []),
			...(to ? [{ at: { lte: new Date(`${to}T23:59:59.999`) } }] : []),
		],
	})

	const [rows, total, groups] = await Promise.all([
		prisma.auditLog.findMany({ where: buildWhere(true), orderBy: { at: "desc" }, take, skip, include: { admin: { select: { username: true, displayName: true } } } }),
		prisma.auditLog.count({ where: buildWhere(true) }),
		prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true }, where: buildWhere(false) }),
	])

	const byCategory = new Map<string, number>()
	for (const g of groups) {
		const key = g.action.includes(".") ? g.action.slice(0, g.action.indexOf(".")) : "other"
		byCategory.set(key, (byCategory.get(key) ?? 0) + g._count._all)
	}

	return ok({
		items: rows.map((r) => ({
			id: r.id,
			at: r.at.toISOString(),
			actor: r.admin?.displayName || r.admin?.username || null,
			actorUsername: r.admin?.username ?? null,
			action: r.action,
			target: r.target,
			meta: r.meta,
			ip: r.ip,
		})),
		total,
		facets: [...byCategory.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
	})
})
