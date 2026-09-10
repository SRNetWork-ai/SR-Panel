import { listOrders } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

export const GET = route(async (req) => {
	const me = await requireAdmin()
	const q = req.nextUrl.searchParams
	return ok(await listOrders(me, { status: q.get("status") || undefined, q: q.get("q") || undefined, take: Number(q.get("take") || 50), skip: Number(q.get("skip") || 0) }))
})
