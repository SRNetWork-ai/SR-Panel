import { listPayments } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

export const GET = route(async (req) => {
	const me = await requireAdmin()
	const q = req.nextUrl.searchParams
	return ok(await listPayments(me, { status: q.get("status") || undefined, kind: q.get("kind") || undefined, take: Number(q.get("take") || 50), skip: Number(q.get("skip") || 0) }))
})
