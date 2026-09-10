import { z } from "zod"
import { brandName, getTelegramSettings, tgGetMe, tgSendMessage } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

const schema = z.object({ botToken: z.string().trim().max(120).optional(), chatId: z.string().trim().max(40).optional() })

export const POST = route(async (req) => {
	await requireOwner()
	const body = await parseBody(req, schema)
	const s = await getTelegramSettings()
	const token = body.botToken || s.botToken
	const chatId = body.chatId || s.chatId
	const me = await tgGetMe(token)
	if (!me.ok) return ok({ ok: false, error: me.error })
	let sent: { ok: boolean; error?: string } = { ok: false, error: "chat id not set" }
	if (chatId) {
		const r = await tgSendMessage(`✅ <b>${brandName()}</b> — اتصال بات تلگرام برقرار است.`, { token, chatId })
		sent = r.ok ? { ok: true } : { ok: false, error: r.error }
	}
	return ok({ ok: true, bot: me.result, sent })
})
