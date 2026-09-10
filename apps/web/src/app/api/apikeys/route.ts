import { createApiKey, listApiKeys } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { apiKeySchema } from "@/lib/schemas"

export const GET = route(async () => {
	const me = await requireAdmin()
	return ok({ items: await listApiKeys(me.id) })
})

export const POST = route(async (req) => {
	const me = await requireAdmin()
	const body = await parseBody(req, apiKeySchema)
	return ok(await createApiKey(me, body), { status: 201 })
})
