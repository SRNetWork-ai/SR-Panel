import { listCustomerTopups } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireCustomer } from "@/lib/shopAuth"

export const dynamic = "force-dynamic"

/** Wallet top-ups that still wait for a payment or a review. */
export const GET = route(async () => {
	const customer = await requireCustomer()
	return ok({ items: await listCustomerTopups(customer) })
})
