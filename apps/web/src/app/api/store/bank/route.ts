import { syncBankDeposits } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

/** Pulls the bank statement bridge on demand («همگام‌سازی اکنون»). */
export const POST = route(async () => {
	const me = await requireAdmin()
	return ok(await syncBankDeposits(me.id))
})
