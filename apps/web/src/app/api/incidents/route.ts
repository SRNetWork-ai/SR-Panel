import { listIncidents } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

export const GET = route(async (req) => {
	await requireOwner()
	const sp = req.nextUrl.searchParams
	const status = sp.get("status")
	const take = Math.min(200, Math.max(1, Number(sp.get("take") || 50)))
	const skip = Math.max(0, Number(sp.get("skip") || 0))
	return ok(await listIncidents({ status: status === "OPEN" || status === "RESOLVED" ? status : undefined, take, skip }))
})
