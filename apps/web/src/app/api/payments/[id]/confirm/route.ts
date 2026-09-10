import { confirmPayment } from "@srpanel/core"
import { ok, parseBody, route, zId } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { reviewSchema } from "@/lib/schemas"

export const POST = route<{ id: string }>(async (req, ctx) => {
	const me = await requireAdmin()
	const { id } = await ctx.params
	const body = await parseBody(req, reviewSchema)
	return ok({ payment: await confirmPayment(zId.parse(id), { by: me, note: body.note ?? null }) })
})
