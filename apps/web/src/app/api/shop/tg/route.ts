import { getTelegramSettings } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { verifyTelegramInitData } from "@/lib/telegramWebApp"

export const dynamic = "force-dynamic"

/** Mini-app: exchange Telegram initData for a verified customer identity. */
export const POST = route(async (req) => {
	const body = await parseBody(req, z.object({ initData: z.string().min(10).max(8000) }))
	const tg = await getTelegramSettings()
	if (!tg.botToken) return ok({ ok: false })
	const r = verifyTelegramInitData(body.initData, tg.botToken)
	if (!r.ok || !r.user) return ok({ ok: false })
	return ok({ ok: true, telegramId: String(r.user.id), name: [r.user.first_name, r.user.last_name].filter(Boolean).join(" ") || r.user.username || null })
})
