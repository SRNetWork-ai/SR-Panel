import { servicesOverview } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

export const GET = route(async () => {
	const owner = await requireOwner()
	return ok(await servicesOverview(owner))
})
