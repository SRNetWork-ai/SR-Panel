import { getPricingSettings, updatePricingSettings } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { pricingSettingsInput } from "@/lib/schemas"

export const GET = route(async () => {
	await requireOwner()
	return ok(await getPricingSettings())
})

export const PUT = route(async (req) => {
	await requireOwner()
	const body = await parseBody(req, pricingSettingsInput)
	return ok(await updatePricingSettings(body))
})
