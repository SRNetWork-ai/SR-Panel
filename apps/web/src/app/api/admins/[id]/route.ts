import { deleteAdmin, updateAdmin } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { toAdminDto } from "@/lib/dto"
import { adminSchema } from "@/lib/schemas"

export const PATCH = route<{ id: string }>(async (req, { params }) => {
	const owner = await requireOwner()
	const { id } = await params
	const body = await parseBody(req, adminSchema.partial())
	const admin = await updateAdmin(owner, id, body)
	return ok(toAdminDto(admin))
})

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
	const owner = await requireOwner()
	const { id } = await params
	await deleteAdmin(owner, id)
	return ok({ ok: true })
})
