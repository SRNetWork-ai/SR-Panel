import { clientOverview } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

/** Counters for the clients page: status chips + the maintenance card. */
export const GET = route(async () => {
	const admin = await requireAdmin()
	return ok(await clientOverview(admin))
})
