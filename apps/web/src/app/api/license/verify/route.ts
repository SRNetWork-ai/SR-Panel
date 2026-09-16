import { redeemLicense } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"

/**
 * Public license endpoint of the vendor panel: a customer install posts its code
 * plus install id and gets the plan / feature list back. Deliberately not under
 * /api/v1 so it needs no API key — a wrong code simply answers 404.
 */
const bodySchema = z.object({
	code: z.string().trim().min(8).max(40),
	instanceId: z.string().trim().min(4).max(80),
	url: z.string().trim().max(200).optional(),
	version: z.string().trim().max(40).optional(),
})

export const POST = route(async (req) => {
	const body = await parseBody(req, bodySchema)
	return ok(await redeemLicense(body))
})
