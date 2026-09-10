import { topupMethods, walletOverview } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

export const GET = route(async () => {
	const me = await requireAdmin()
	const [overview, methods] = await Promise.all([walletOverview(me), topupMethods()])
	return ok({ ...overview, topupMethods: methods, isOwner: me.role === "OWNER" })
})
