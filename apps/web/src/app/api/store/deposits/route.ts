import { cardAutoSettings, ingestDeposit, rematchDeposits, toCardAutoDto } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { manualDepositInput } from "@/lib/schemas"

export const GET = route(async () => {
	const me = await requireAdmin()
	const s = await cardAutoSettings(me.id)
	return ok({ deposits: s.deposits, card: toCardAutoDto(s) })
})

/** Seller types a deposit by hand (bank SMS arrived on another phone, etc). */
export const POST = route(async (req) => {
	const me = await requireAdmin()
	const body = await parseBody(req, manualDepositInput)
	const result = await ingestDeposit(me.id, {
		amount: body.amount,
		refId: body.refId ?? null,
		last4: body.last4 ?? null,
		sender: "ثبت دستی",
		raw: body.note ?? "ثبت دستی اپراتور",
		source: "MANUAL",
	})
	const s = await cardAutoSettings(me.id)
	return ok({ ...result, deposits: s.deposits })
})

/** Re-runs matching for deposits that are still open. */
export const PATCH = route(async () => {
	const me = await requireAdmin()
	const result = await rematchDeposits(me.id)
	const s = await cardAutoSettings(me.id)
	return ok({ ...result, deposits: s.deposits })
})
