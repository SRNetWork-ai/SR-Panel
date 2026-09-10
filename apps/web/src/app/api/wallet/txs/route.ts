import { listWalletTxs } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

export const GET = route(async (req) => {
	const me = await requireAdmin()
	const q = req.nextUrl.searchParams
	const adminId = me.role === "OWNER" && q.get("adminId") ? String(q.get("adminId")) : me.id
	return ok(await listWalletTxs(adminId, { take: Number(q.get("take") || 50), skip: Number(q.get("skip") || 0) }))
})
