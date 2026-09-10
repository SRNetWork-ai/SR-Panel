import { createAdmin, listAdmins } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { toAdminDto } from "@/lib/dto"
import { adminSchema } from "@/lib/schemas"

export const GET = route(async () => {
	const owner = await requireOwner()
	const admins = await listAdmins(owner)
	return ok(admins.map((a) => toAdminDto(a as any)))
})

export const POST = route(async (req) => {
	const owner = await requireOwner()
	const body = await parseBody(req, adminSchema.required({ password: true }))
	const admin = await createAdmin(owner, body)
	return ok(toAdminDto(admin), { status: 201 })
})
