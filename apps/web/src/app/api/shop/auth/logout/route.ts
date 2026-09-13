import { cookies } from "next/headers"
import { logoutCustomer } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { CUSTOMER_COOKIE } from "@/lib/shopAuth"

export const dynamic = "force-dynamic"

export const POST = route(async () => {
	const jar = await cookies()
	const token = jar.get(CUSTOMER_COOKIE)?.value
	if (token) await logoutCustomer(token)
	jar.delete(CUSTOMER_COOKIE)
	return ok({ ok: true })
})
