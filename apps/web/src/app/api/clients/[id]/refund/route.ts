import { getClientForActor, quoteRefund } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

/** GET /api/clients/:id/refund - what deleting this client would give back. */
export const GET = route<{ id: string }>(async (_req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	await getClientForActor(admin, id)
	return ok(await quoteRefund(id))
})
