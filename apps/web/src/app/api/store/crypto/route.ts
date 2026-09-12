import { cryptoSettings, saveCryptoAssets } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { cryptoAssetsInput } from "@/lib/schemas"

export const GET = route(async () => {
	const me = await requireAdmin()
	return ok(await cryptoSettings(me.id))
})

export const PUT = route(async (req) => {
	const me = await requireAdmin()
	const body = await parseBody(req, cryptoAssetsInput)
	// core stores plain strings; the API allows null for «cleared» fields
	const assets = body.assets.map((a) => ({ ...a, memo: a.memo ?? "", label: a.label ?? "" }))
	return ok(await saveCryptoAssets(me.id, assets))
})
