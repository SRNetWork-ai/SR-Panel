import { adjustCustomerCredit } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route, zId } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

/** positive = add credit, negative = take it back */
const creditSchema = z.object({
	amount: z.number().int().min(-2_000_000_000).max(2_000_000_000),
	note: z.string().max(200).optional(),
})

export const POST = route<{ id: string }>(async (req, ctx) => {
	const me = await requireAdmin()
	const { id } = await ctx.params
	const body = await parseBody(req, creditSchema)
	return ok(await adjustCustomerCredit(me, zId.parse(id), BigInt(body.amount), body.note ?? null))
})
