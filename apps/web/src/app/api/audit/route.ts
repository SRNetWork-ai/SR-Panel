import { prisma } from "@srpanel/db"
import { ok, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

export const GET = route(async (req) => {
	await requireOwner()
	const sp = req.nextUrl.searchParams
	const take = Math.min(200, Math.max(1, Number(sp.get("take") ?? 50)))
	const skip = Math.max(0, Number(sp.get("skip") ?? 0))
	const q = sp.get("q")?.trim()
	const where = q ? { OR: [{ action: { contains: q, mode: "insensitive" as const } }, { target: { contains: q, mode: "insensitive" as const } }, { admin: { username: { contains: q, mode: "insensitive" as const } } }] } : {}
	const [rows, total] = await Promise.all([
		prisma.auditLog.findMany({ where, orderBy: { at: "desc" }, take, skip, include: { admin: { select: { username: true, displayName: true } } } }),
		prisma.auditLog.count({ where }),
	])
	return ok({
		items: rows.map((r) => ({ id: r.id, at: r.at.toISOString(), actor: r.admin?.displayName || r.admin?.username || "—", action: r.action, target: r.target, meta: r.meta, ip: r.ip })),
		total,
	})
})
