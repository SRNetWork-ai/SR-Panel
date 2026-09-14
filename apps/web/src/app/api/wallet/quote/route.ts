import { quoteForActor } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

/**
 * GET /api/wallet/quote?gb=&days=&renew=1&quotaGb=&unlimited=1
 *
 * Read-only receipt for the client form: cost, wallet balance after the purchase
 * and every quota/credit limit that would reject the request.
 */
const num = (raw: string | null, max: number): number => {
	const n = Number(raw ?? 0)
	return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0
}

export const GET = route(async (req) => {
	const me = await requireAdmin()
	const q = req.nextUrl.searchParams
	const quotaGb = q.get("quotaGb")
	return ok(
		await quoteForActor(me, {
			trafficGB: num(q.get("gb"), 1_000_000),
			days: num(q.get("days"), 36_500),
			renew: q.get("renew") === "1",
			quotaGB: quotaGb === null ? undefined : num(quotaGb, 1_000_000),
			unlimited: q.get("unlimited") === "1",
		}),
	)
})
