import { attachCustomerToOrder, createOrder } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { clientIp } from "@/lib/auth"
import { shopOrderSchema } from "@/lib/schemas"
import { currentCustomer } from "@/lib/shopAuth"

export const dynamic = "force-dynamic"

export const POST = route<{ slug: string }>(async (req, ctx) => {
	const { slug } = await ctx.params
	const body = await parseBody(req, shopOrderSchema)
	// logged-in buyers get the order attached to their account (contact info prefilled)
	const customer = await currentCustomer()
	const r = await createOrder(slug, {
		planId: body.planId,
		method: body.method,
		customer: {
			name: body.name ?? customer?.name ?? null,
			telegramId: body.telegramId ?? customer?.telegramId ?? null,
			phone: body.phone ?? customer?.phone ?? null,
			email: body.email ?? customer?.email ?? null,
		},
		discountCode: body.discountCode,
		renewToken: body.renewToken,
		ip: await clientIp(),
	})
	if (customer) await attachCustomerToOrder(r.token, customer)
	return ok({ token: r.token, status: r.order.status, next: r.next, paymentId: r.payment?.id ?? null }, { status: 201 })
})
