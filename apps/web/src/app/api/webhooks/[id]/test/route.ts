import { testWebhook } from "@srpanel/core"
import { ok, route, zId } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

export const POST = route<{ id: string }>(async (_req, ctx) => {
	const me = await requireAdmin()
	const { id } = await ctx.params
	return ok(await testWebhook(me.id, zId.parse(id)))
})
