import { customerPaymentView } from "@srpanel/core"
import { ok, route, zId } from "@/lib/api"
import { requireCustomer } from "@/lib/shopAuth"

export const dynamic = "force-dynamic"

/** Polled by the shop account page while a top-up is pending. */
export const GET = route<{ id: string }>(async (_req, ctx) => {
	const customer = await requireCustomer()
	const { id } = await ctx.params
	return ok(await customerPaymentView(customer, zId.parse(id)))
})
