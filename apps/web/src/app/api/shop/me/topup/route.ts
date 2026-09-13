import { createCustomerTopup, customerTopupSchema } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireCustomer } from "@/lib/shopAuth"

export const dynamic = "force-dynamic"

/** Starts a wallet top-up (card / crypto / Zarinpal) for the logged-in customer. */
export const POST = route(async (req) => {
	const customer = await requireCustomer()
	const body = await parseBody(req, customerTopupSchema)
	const r = await createCustomerTopup(customer, body)
	return ok({ paymentId: r.payment.id, amount: r.payment.amount.toString(), expiresAt: r.payment.expiresAt, next: r.next }, { status: 201 })
})
