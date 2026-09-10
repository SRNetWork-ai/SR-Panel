import { revokeApiKey } from "@srpanel/core"
import { ok, route, zId } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

export const DELETE = route<{ id: string }>(async (_req, ctx) => {
	const me = await requireAdmin()
	const { id } = await ctx.params
	await revokeApiKey(me, zId.parse(id))
	return ok({ ok: true })
})
