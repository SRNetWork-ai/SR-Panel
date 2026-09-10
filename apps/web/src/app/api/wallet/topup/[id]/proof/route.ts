import { paymentForActor, paymentNext, settingsForPayment, submitProof } from "@srpanel/core"
import { ok, parseBody, route, zId } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { proofSchema } from "@/lib/schemas"

export const POST = route<{ id: string }>(async (req, ctx) => {
	const me = await requireAdmin()
	const { id } = await ctx.params
	const p = await paymentForActor(me, zId.parse(id))
	const body = await parseBody(req, proofSchema)
	const payment = await submitProof(p.id, body)
	return ok({ payment, next: paymentNext(payment, await settingsForPayment(payment)) })
})
