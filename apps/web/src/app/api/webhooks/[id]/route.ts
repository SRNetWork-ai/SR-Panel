import { deleteWebhook, updateWebhook } from "@srpanel/core"
import { ok, parseBody, route, zId } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { webhookSchema } from "@/lib/schemas"

export const PATCH = route<{ id: string }>(async (req, ctx) => {
	const me = await requireAdmin()
	const { id } = await ctx.params
	const body = await parseBody(req, webhookSchema.partial())
	return ok({ webhook: await updateWebhook(me.id, zId.parse(id), body) })
})

export const DELETE = route<{ id: string }>(async (_req, ctx) => {
	const me = await requireAdmin()
	const { id } = await ctx.params
	await deleteWebhook(me.id, zId.parse(id))
	return ok({ ok: true })
})
