import { z } from "zod"
import { getPricingSettings, getRefundSettings, updatePricingSettings, updateRefundSettings } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { pricingSettingsInput } from "@/lib/schemas"

/**
 * Pricing + refund policy travel together in the UI but live in two Setting
 * keys, so newer fields stay optional and older clients keep working.
 */
const pricingInput = pricingSettingsInput.extend({
	lowBalance: z.number().int().min(0).max(1e12).optional(),
	refundEnabled: z.boolean().optional(),
	refundPercent: z.number().int().min(0).max(100).optional(),
	refundMin: z.number().int().min(0).max(1e12).optional(),
})

export const GET = route(async () => {
	await requireOwner()
	const [pricing, refund] = await Promise.all([getPricingSettings(), getRefundSettings()])
	return ok({ ...pricing, ...refund })
})

export const PUT = route(async (req) => {
	await requireOwner()
	const body = await parseBody(req, pricingInput)
	const current = await getRefundSettings()
	const [pricing, refund] = await Promise.all([updatePricingSettings(body), updateRefundSettings({ ...current, ...body })])
	return ok({ ...pricing, ...refund })
})
