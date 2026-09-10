import { WEBHOOK_EVENTS, createWebhook, listWebhooks } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { webhookSchema } from "@/lib/schemas"

export const GET = route(async () => {
	const me = await requireAdmin()
	return ok({ items: await listWebhooks(me.id), events: WEBHOOK_EVENTS })
})

export const POST = route(async (req) => {
	const me = await requireAdmin()
	const body = await parseBody(req, webhookSchema)
	return ok({ webhook: await createWebhook(me.id, body) }, { status: 201 })
})
