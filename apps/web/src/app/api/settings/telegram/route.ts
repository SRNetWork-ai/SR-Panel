import { getTelegramSettings, setSetting, telegramSettingsSchema } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { telegramSettingsInput } from "@/lib/schemas"

const mask = (t: string) => (t ? t.slice(0, 6) + "…" + t.slice(-4) : "")

export const GET = route(async () => {
	await requireOwner()
	const s = await getTelegramSettings()
	return ok({ ...s, botToken: "", botTokenMasked: mask(s.botToken), hasToken: !!s.botToken })
})

export const PUT = route(async (req) => {
	await requireOwner()
	const body = await parseBody(req, telegramSettingsInput)
	const prev = await getTelegramSettings()
	// empty token in the form keeps the stored one
	const saved = await setSetting("telegram", telegramSettingsSchema, { ...body, botToken: body.botToken || prev.botToken })
	return ok({ ...saved, botToken: "", botTokenMasked: mask(saved.botToken), hasToken: !!saved.botToken })
})
