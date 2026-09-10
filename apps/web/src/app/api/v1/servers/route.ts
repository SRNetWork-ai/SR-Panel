import { listServersFor } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireApiKey } from "@/lib/apiAuth"
import { toServerDto } from "@/lib/dto"

export const GET = route(async (req) => {
	const { admin } = await requireApiKey(req, "read")
	const servers = await listServersFor(admin)
	return ok({ items: servers.map((s) => toServerDto(s)) })
})
