import { z } from "zod"
import { createOrder } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { clientIp } from "@/lib/auth"
import { shopOrderSchema } from "@/lib/schemas"
import { currentCustomer } from "@/lib/shopAuth"

export const dynamic = "force-dynamic"

/** Logged-in buyers may additionally pay from their wallet balance. */
const orderSchema = shopOrderSchema.extend({ method: z.enum(["USDT", "CARD", "ZARINPAL", "WALLET"]) })

export const POST = route<{ slug: string }>(async (req, ctx) => {
	const { slug } = await ctx.params
	const body = await parseBody(req, orderSchema)
	// the order is attached to the account and the contact info is prefilled from it
	const customer = await currentCustomer()
	const r = await createOrder(slug, {
		planId: body.planId,
		method: body.method,
		customerId: customer?.id ?? null,
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
	return ok({ token: r.token, status: r.order.status, next: r.next, paymentId: r.payment?.id ?? null }, { status: 201 })
})
