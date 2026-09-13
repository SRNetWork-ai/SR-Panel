import { listCustomers } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

/** Storefront customers of the current seller (owner sees everyone). */
export const GET = route(async (req) => {
	const me = await requireAdmin()
	const q = req.nextUrl.searchParams
	const items = await listCustomers(me, { q: q.get("q"), adminId: q.get("adminId"), limit: Number(q.get("limit") || 50) })
	return ok({ items })
})
