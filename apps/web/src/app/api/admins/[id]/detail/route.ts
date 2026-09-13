import { adminDetail } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

export const GET = route<{ id: string }>(async (_req, { params }) => {
	const owner = await requireOwner()
	const { id } = await params
	return ok(await adminDetail(owner, id))
})
