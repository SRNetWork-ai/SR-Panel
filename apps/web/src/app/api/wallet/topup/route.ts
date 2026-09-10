import { createTopup, listPayments } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { topupSchema } from "@/lib/schemas"

export const GET = route(async () => {
	const me = await requireAdmin()
	return ok(await listPayments({ id: me.id, role: "ADMIN" }, { kind: "TOPUP", take: 30 }))
})

export const POST = route(async (req) => {
	const me = await requireAdmin()
	const body = await parseBody(req, topupSchema)
	return ok(await createTopup(me, body), { status: 201 })
})
