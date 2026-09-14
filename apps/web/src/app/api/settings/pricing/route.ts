import { z } from "zod"
import { getPricingSettings, updatePricingSettings } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { pricingSettingsInput } from "@/lib/schemas"

/** low-balance alert threshold is optional so older clients keep working */
const pricingInput = pricingSettingsInput.extend({ lowBalance: z.number().int().min(0).max(1e12).optional() })

export const GET = route(async () => {
	await requireOwner()
	return ok(await getPricingSettings())
})

export const PUT = route(async (req) => {
	await requireOwner()
	const body = await parseBody(req, pricingInput)
	return ok(await updatePricingSettings(body))
})
