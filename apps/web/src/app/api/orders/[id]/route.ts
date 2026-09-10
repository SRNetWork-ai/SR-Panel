import { orderForActor } from "@srpanel/core"
import { ok, route, zId } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

export const GET = route<{ id: string }>(async (_req, ctx) => {
	const me = await requireAdmin()
	const { id } = await ctx.params
	return ok({ order: await orderForActor(me, zId.parse(id)) })
})
