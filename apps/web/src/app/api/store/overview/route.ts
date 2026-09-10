import { storeOverview } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

export const GET = route(async () => {
	const me = await requireAdmin()
	return ok(await storeOverview(me))
})
