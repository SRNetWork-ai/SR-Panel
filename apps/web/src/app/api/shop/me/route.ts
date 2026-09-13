import { customerProfileSchema, customerSummary, linkCustomerClients, toCustomerDto, updateCustomerProfile } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireCustomer } from "@/lib/shopAuth"

export const dynamic = "force-dynamic"

/** Customer dashboard: profile, wallet balance, orders and active services. */
export const GET = route(async () => {
	const customer = await requireCustomer()
	await linkCustomerClients(customer.id)
	return ok(await customerSummary(customer.id))
})

export const PATCH = route(async (req) => {
	const customer = await requireCustomer()
	const body = await parseBody(req, customerProfileSchema)
	return ok(toCustomerDto(await updateCustomerProfile(customer, body)))
})
