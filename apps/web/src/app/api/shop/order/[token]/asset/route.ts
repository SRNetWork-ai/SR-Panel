import { orderCryptoOptions, publicOrder, selectOrderAsset } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"

export const dynamic = "force-dynamic"

const bodySchema = z.object({ assetId: z.string().min(1).max(40) })

/** Coins/networks the buyer may pay with, each with a freshly calculated amount. */
export const GET = route<{ token: string }>(async (_req, ctx) => {
	const { token } = await ctx.params
	return ok(await orderCryptoOptions(token))
})

/** Switch the open crypto payment to another coin/network (re-quotes the amount). */
export const POST = route<{ token: string }>(async (req, ctx) => {
	const { token } = await ctx.params
	const { assetId } = await parseBody(req, bodySchema)
	await selectOrderAsset(token, assetId)
	return ok(await publicOrder(token))
})
