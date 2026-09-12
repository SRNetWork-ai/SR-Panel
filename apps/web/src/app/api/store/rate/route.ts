import { fetchUsdtRate, fxSettings, refreshUsdtRate } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { fxSettingsInput } from "@/lib/schemas"

/** `test` tries the chain without touching the saved cache (used by the «تست نرخ» button). */
const bodySchema = z.object({ test: z.boolean().optional(), settings: fxSettingsInput.optional() })

export const GET = route(async () => {
	const me = await requireAdmin()
	const s = await fxSettings(me.id)
	return ok({ mode: s.mode, rate: s.cacheRate, source: s.cacheSource, at: s.cacheAt || null, error: s.lastError || null })
})

export const POST = route(async (req) => {
	const me = await requireAdmin()
	const { test, settings } = await parseBody(req, bodySchema)
	if (test) {
		const current = await fxSettings(me.id)
		const result = await fetchUsdtRate({ ...current, ...(settings ?? {}) })
		return ok({ ...result, saved: false })
	}
	const status = await refreshUsdtRate(me.id, { force: true })
	return ok({ ...status, saved: true })
})
