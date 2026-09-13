import { cookies } from "next/headers"
import { changeCustomerPassword, customerPasswordSchema } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { CUSTOMER_COOKIE, requireCustomer } from "@/lib/shopAuth"

export const dynamic = "force-dynamic"

/** Changing the password drops every session of this account, including this one. */
export const POST = route(async (req) => {
	const customer = await requireCustomer()
	const body = await parseBody(req, customerPasswordSchema)
	await changeCustomerPassword(customer, body.current, body.next)
	const jar = await cookies()
	jar.delete(CUSTOMER_COOKIE)
	return ok({ ok: true })
})
