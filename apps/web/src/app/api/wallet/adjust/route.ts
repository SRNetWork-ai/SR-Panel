import { adjustCredit } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { walletAdjustSchema } from "@/lib/schemas"

export const POST = route(async (req) => {
	const me = await requireOwner()
	const body = await parseBody(req, walletAdjustSchema)
	return ok({ tx: await adjustCredit(me, body.adminId, BigInt(body.amount), body.note ?? null) })
})
