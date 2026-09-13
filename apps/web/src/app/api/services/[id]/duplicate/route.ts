import { duplicateService } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

export const POST = route<{ id: string }>(async (_req, { params }) => {
	const owner = await requireOwner()
	const { id } = await params
	return ok({ service: await duplicateService(owner, id) }, { status: 201 })
})
