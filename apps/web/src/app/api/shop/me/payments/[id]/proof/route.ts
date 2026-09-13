import { submitCustomerProof } from "@srpanel/core"
import { ok, parseBody, route, zId } from "@/lib/api"
import { proofSchema } from "@/lib/schemas"
import { requireCustomer } from "@/lib/shopAuth"

export const dynamic = "force-dynamic"

/** TXID / receipt reference of a wallet top-up. */
export const POST = route<{ id: string }>(async (req, ctx) => {
	const customer = await requireCustomer()
	const { id } = await ctx.params
	const body = await parseBody(req, proofSchema)
	return ok(await submitCustomerProof(customer, zId.parse(id), body))
})
