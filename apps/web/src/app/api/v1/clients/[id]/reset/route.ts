import { resetClientTraffic } from "@srpanel/core"
import { ok, route, zId } from "@/lib/api"
import { requireApiKey } from "@/lib/apiAuth"

export const POST = route<{ id: string }>(async (req, ctx) => {
	const { admin } = await requireApiKey(req, "write")
	const { id } = await ctx.params
	const errors = await resetClientTraffic(admin, zId.parse(id))
	return ok({ ok: true, errors })
})
