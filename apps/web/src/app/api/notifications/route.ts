import { listNotifications } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

export const GET = route(async () => {
	await requireOwner()
	return ok({ items: await listNotifications(100) })
})
