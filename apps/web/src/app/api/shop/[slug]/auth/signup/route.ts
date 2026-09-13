import { cookies, headers } from "next/headers"
import { customerSignupSchema, signupCustomer, toCustomerDto } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { clientIp } from "@/lib/auth"
import { CUSTOMER_COOKIE, customerCookieOptions, requireStore } from "@/lib/shopAuth"

export const dynamic = "force-dynamic"

export const POST = route<{ slug: string }>(async (req, ctx) => {
	const { slug } = await ctx.params
	const store = await requireStore(slug)
	const body = await parseBody(req, customerSignupSchema)
	const h = await headers()
	const { token, customer } = await signupCustomer(store.settings, body, { ip: await clientIp(), userAgent: h.get("user-agent") })
	const jar = await cookies()
	jar.set(CUSTOMER_COOKIE, token, customerCookieOptions())
	return ok({ customer: toCustomerDto(customer) }, { status: 201 })
})
