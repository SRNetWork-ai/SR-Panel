import { setResellerPricing } from "@srpanel/core"
import { ok, parseBody, route, zId } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { resellerPricingSchema } from "@/lib/schemas"

export const PATCH = route<{ id: string }>(async (req, ctx) => {
	const me = await requireOwner()
	const { id } = await ctx.params
	const body = await parseBody(req, resellerPricingSchema)
	return ok({ admin: await setResellerPricing(me, zId.parse(id), body) })
})
