import { createDiscount, listDiscounts } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { discountSchema } from "@/lib/schemas"

export const GET = route(async () => {
	const me = await requireAdmin()
	return ok({ discounts: await listDiscounts(me) })
})

export const POST = route(async (req) => {
	const me = await requireAdmin()
	const body = await parseBody(req, discountSchema)
	return ok({ discount: await createDiscount(me, body) }, { status: 201 })
})
