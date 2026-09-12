import { adminByDepositToken, ingestDeposit, ingestSmsText } from "@srpanel/core"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { ok, route } from "@/lib/api"
import { depositHookSchema } from "@/lib/schemas"

/**
 * Public deposit webhook — no session, the token in the path is the secret.
 *
 * Accepts anything a phone "SMS forwarder" app can send:
 *   POST {"text":"...","sender":"6037..."}            (JSON)
 *   POST text=...&sender=...                            (form / query string body)
 *   POST <raw sms body>                                 (text/plain)
 *   GET  ?text=...&sender=...  |  ?amount=250000&ref=12 (link-only forwarders)
 */
export const dynamic = "force-dynamic"

type Hook = z.infer<typeof depositHookSchema>

const clip = (v: string) => v.slice(0, 1200)

function fromParams(sp: URLSearchParams): Hook {
	return depositHookSchema.parse({
		text: sp.get("text") ?? sp.get("body") ?? sp.get("message") ?? sp.get("msg") ?? undefined,
		sender: sp.get("sender") ?? sp.get("from") ?? undefined,
		amount: sp.get("amount") ?? undefined,
		refId: sp.get("refId") ?? sp.get("ref") ?? undefined,
		last4: sp.get("last4") ?? undefined,
		at: sp.get("at") ?? sp.get("date") ?? undefined,
	})
}

async function readBody(req: NextRequest): Promise<Hook> {
	const raw = await req.text().catch(() => "")
	const trimmed = raw.trim()
	if (!trimmed) return fromParams(req.nextUrl.searchParams)
	if (trimmed.startsWith("{")) {
		try {
			return depositHookSchema.parse(JSON.parse(trimmed))
		} catch {
			/* fall through: treat it as plain text */
		}
	}
	if (/^[^\s]+=[^\s]*(&|$)/.test(trimmed)) {
		try {
			return fromParams(new URLSearchParams(trimmed))
		} catch {
			/* fall through */
		}
	}
	const sp = req.nextUrl.searchParams
	return depositHookSchema.parse({ text: clip(trimmed), sender: sp.get("sender") ?? sp.get("from") ?? undefined })
}

async function handle(adminId: string, input: Hook): Promise<Response> {
	const text = String(input.text ?? input.body ?? input.message ?? input.msg ?? "").trim()
	const sender = input.sender ?? input.from ?? null
	if (text) {
		const result = await ingestSmsText(adminId, text, sender)
		return ok(result, { status: result.ok ? 200 : 202 })
	}
	const amount = Math.round(Number(String(input.amount ?? "").replace(/[^0-9.]/g, "")))
	if (!Number.isFinite(amount) || amount <= 0) {
		return ok({ ok: false, status: "IGNORED", message: "متن پیامک یا مبلغ واریز ارسال نشده است", deposit: null }, { status: 400 })
	}
	const result = await ingestDeposit(adminId, {
		amount,
		refId: input.refId ?? null,
		last4: input.last4 ?? null,
		sender,
		raw: JSON.stringify(input).slice(0, 400),
		at: input.at ?? null,
		source: "SMS",
	})
	return ok(result, { status: result.ok ? 200 : 202 })
}

export const POST = route<{ token: string }>(async (req, ctx) => {
	const { token } = await ctx.params
	const adminId = await adminByDepositToken(token)
	if (!adminId) return ok({ ok: false, message: "توکن نامعتبر است" }, { status: 404 })
	return handle(adminId, await readBody(req))
})

export const GET = route<{ token: string }>(async (req, ctx) => {
	const { token } = await ctx.params
	const adminId = await adminByDepositToken(token)
	if (!adminId) return ok({ ok: false, message: "توکن نامعتبر است" }, { status: 404 })
	const sp = req.nextUrl.searchParams
	if (Array.from(sp.keys()).length === 0) return ok({ ok: true, message: "وب‌هوک واریز فعال است" })
	return handle(adminId, fromParams(sp))
})
