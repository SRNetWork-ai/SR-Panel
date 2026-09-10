import { createPlan, listPlans } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { planSchema } from "@/lib/schemas"

export const GET = route(async (req) => {
	const me = await requireAdmin()
	const adminId = req.nextUrl.searchParams.get("adminId") || undefined
	return ok({ plans: await listPlans(me, { adminId }) })
})

export const POST = route(async (req) => {
	const me = await requireAdmin()
	const body = await parseBody(req, planSchema)
	return ok({ plan: await createPlan(me, body) }, { status: 201 })
})
