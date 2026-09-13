import { cardAutoSettings, ensureSmsToken, fxSettings, isFxFresh, saveCardAuto, saveFxSettings, saveStorePage, setBankSecret, storePage, storePageSchema, toCardAutoDto } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { storeExtrasInput } from "@/lib/schemas"

/** Everything the store screens need beyond `StoreSettings`: FX, card auto-verify, page content. */
async function payload(adminId: string) {
	const [fx, card, page] = await Promise.all([fxSettings(adminId), cardAutoSettings(adminId), storePage(adminId)])
	return { fx: { ...fx, fresh: isFxFresh(fx) }, card: toCardAutoDto(card), page }
}

/** The UI sends its own (mirrored) page schema, so the patch is re-validated with the core one. */
const pagePatch = storePageSchema.partial()

export const GET = route(async () => {
	const me = await requireAdmin()
	return ok(await payload(me.id))
})

export const PUT = route(async (req) => {
	const me = await requireAdmin()
	const body = await parseBody(req, storeExtrasInput)
	if (body.fx) await saveFxSettings(me.id, body.fx)
	if (body.card) {
		const { bankSecret, ...rest } = body.card
		await saveCardAuto(me.id, rest)
		if (bankSecret !== undefined) await setBankSecret(me.id, bankSecret)
		// SMS verification is useless without a webhook URL, so mint the token right away
		if (rest.mode === "SMS") await ensureSmsToken(me.id)
	}
	if (body.page) await saveStorePage(me.id, pagePatch.parse(body.page))
	return ok(await payload(me.id))
})
