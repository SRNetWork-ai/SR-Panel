import { handlePaymentPluginCallback } from "@srpanel/core"
import { ok, route } from "@/lib/api"

/**
 * Public payment-plugin callback - no session, the HMAC signature is the proof.
 *
 *   POST /api/hooks/pay/<pluginId>
 *   x-srp-signature: <hex hmac-sha256 of the raw body, keyed with the plugin secret>
 *   {"paymentId":"...","status":"ok","amount":250000,"refId":"..."}
 *
 * A valid call ends in the same confirmPayment the panel uses for card, crypto
 * and Zarinpal, so a plugin never becomes a new payment method.
 */
export const dynamic = "force-dynamic"

export const POST = route<{ id: string }>(async (req, ctx) => {
	const { id } = await ctx.params
	const raw = await req.text()
	const sig = req.headers.get("x-srp-signature") ?? req.headers.get("x-signature") ?? req.nextUrl.searchParams.get("sig")
	return ok(await handlePaymentPluginCallback(id, raw, sig))
})

/** Plain ping so a provider can check the address in a browser. */
export const GET = route<{ id: string }>(async () => ok({ ok: true, message: "\u0648\u0628\u200c\u0647\u0648\u06a9 \u0627\u0641\u0632\u0648\u0646\u0647\u0654 \u067e\u0631\u062f\u0627\u062e\u062a \u0641\u0639\u0627\u0644 \u0627\u0633\u062a\u061b \u062a\u0623\u06cc\u06cc\u062f \u0631\u0627 \u0628\u0627 POST \u0648 \u0627\u0645\u0636\u0627\u06cc HMAC \u0628\u0641\u0631\u0633\u062a\u06cc\u062f" }))
