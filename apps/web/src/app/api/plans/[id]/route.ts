import { deletePlan, updatePlan } from "@srpanel/core"
import { ok, parseBody, route, zId } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { planSchema } from "@/lib/schemas"

export const PATCH = route<{ id: string }>(async (req, ctx) => {
	const me = await requireAdmin()
	const { id } = await ctx.params
	const body = await parseBody(req, planSchema.partial())
	return ok({ plan: await updatePlan(me, zId.parse(id), body) })
})

export const DELETE = route<{ id: string }>(async (_req, ctx) => {
	const me = await requireAdmin()
	const { id } = await ctx.params
	await deletePlan(me, zId.parse(id))
	return ok({ ok: true })
})
