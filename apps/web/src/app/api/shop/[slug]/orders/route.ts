import { createOrder } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { clientIp } from "@/lib/auth"
import { shopOrderSchema } from "@/lib/schemas"

export const dynamic = "force-dynamic"

export const POST = route<{ slug: string }>(async (req, ctx) => {
	const { slug } = await ctx.params
	const body = await parseBody(req, shopOrderSchema)
	const r = await createOrder(slug, {
		planId: body.planId,
		method: body.method,
		customer: { name: body.name, telegramId: body.telegramId, phone: body.phone, email: body.email },
		discountCode: body.discountCode,
		renewToken: body.renewToken,
		ip: await clientIp(),
	})
	return ok({ token: r.token, status: r.order.status, next: r.next, paymentId: r.payment?.id ?? null }, { status: 201 })
})
