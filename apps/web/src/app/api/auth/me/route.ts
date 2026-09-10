import { ok, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { toAdminDto } from "@/lib/dto"

export const GET = route(async () => {
	const admin = await requireAdmin()
	return ok(toAdminDto(admin))
})
