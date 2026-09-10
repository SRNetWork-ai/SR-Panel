import { getClientForActor, resetClientTraffic } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { publicUrl, toClientDto } from "@/lib/dto"

export const POST = route<{ id: string }>(async (_req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	const errors = await resetClientTraffic(admin, id)
	const client = await getClientForActor(admin, id)
	return ok({ client: toClientDto(client, publicUrl()), errors })
})
