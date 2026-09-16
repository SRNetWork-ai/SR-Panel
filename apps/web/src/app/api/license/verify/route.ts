import { AppError, redeemLicense } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"

/**
 * Public license endpoint of the vendor panel: a customer install posts its code
 * plus install id and gets the plan / feature list back. Deliberately not under
 * /api/v1 so it needs no API key -- a wrong code simply answers 404. Because it
 * is unauthenticated it carries a small per-IP budget against code guessing.
 */
const bodySchema = z.object({
	code: z.string().trim().min(8).max(40),
	instanceId: z.string().trim().min(4).max(80),
	url: z.string().trim().max(200).optional(),
	version: z.string().trim().max(40).optional(),
})

const WINDOW_MS = 600_000
const MAX_HITS = 30
const MAX_KEYS = 5_000
const hits = new Map<string, { n: number; reset: number }>()

const ipOf = (req: Request): string => {
	const fwd = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
	return fwd || req.headers.get("x-real-ip") || "unknown"
}

function budget(ip: string): void {
	const now = Date.now()
	if (hits.size > MAX_KEYS) {
		for (const [key, value] of hits) if (value.reset <= now) hits.delete(key)
	}
	const cur = hits.get(ip)
	if (!cur || cur.reset <= now) {
		hits.set(ip, { n: 1, reset: now + WINDOW_MS })
		return
	}
	cur.n += 1
	if (cur.n > MAX_HITS)
		throw new AppError(
			"\u062f\u0631\u062e\u0648\u0627\u0633\u062a\u200c\u0647\u0627\u06cc \u0628\u0631\u0631\u0633\u06cc \u0644\u0627\u06cc\u0633\u0646\u0633 \u0628\u06cc\u0634 \u0627\u0632 \u062d\u062f \u0645\u062c\u0627\u0632 \u0627\u0633\u062a",
		)
}

export const POST = route(async (req) => {
	budget(ipOf(req))
	const body = await parseBody(req, bodySchema)
	return ok(await redeemLicense(body))
})
