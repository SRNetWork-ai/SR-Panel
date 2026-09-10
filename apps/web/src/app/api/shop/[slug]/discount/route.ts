import { previewDiscount } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { shopDiscountSchema } from "@/lib/schemas"

export const POST = route<{ slug: string }>(async (req, ctx) => {
	const { slug } = await ctx.params
	const body = await parseBody(req, shopDiscountSchema)
	return ok(await previewDiscount(slug, body.planId, body.code))
})
