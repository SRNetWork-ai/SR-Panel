import { AppError, latestPaymentByOrderToken, publicOrder, submitProof } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { proofSchema } from "@/lib/schemas"

export const dynamic = "force-dynamic"

export const POST = route<{ token: string }>(async (req, ctx) => {
	const { token } = await ctx.params
	const { payment } = await latestPaymentByOrderToken(token)
	if (!payment) throw new AppError("پرداختی برای این سفارش ثبت نشده است")
	const body = await parseBody(req, proofSchema)
	await submitProof(payment.id, body)
	return ok(await publicOrder(token))
})
