import { deleteService, updateService } from "@srpanel/core"
import { ok, parseBody, route, zId } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { serviceUpdateSchema } from "@/lib/schemas"

export const PATCH = route<{ id: string }>(async (req, ctx) => {
	const me = await requireOwner()
	const { id } = await ctx.params
	const body = await parseBody(req, serviceUpdateSchema)
	return ok({ service: await updateService(me, zId.parse(id), body) })
})

export const DELETE = route<{ id: string }>(async (_req, ctx) => {
	const me = await requireOwner()
	const { id } = await ctx.params
	await deleteService(me, zId.parse(id))
	return ok({ ok: true })
})
