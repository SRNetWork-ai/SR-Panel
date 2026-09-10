import { ok, route } from "@/lib/api"
import { requireApiKey } from "@/lib/apiAuth"
import { toAdminDto } from "@/lib/dto"

export const GET = route(async (req) => {
	const { admin, key } = await requireApiKey(req, "read")
	return ok({ admin: toAdminDto(admin as any), key: { id: key.id, name: key.name, scopes: key.scopes } })
})
