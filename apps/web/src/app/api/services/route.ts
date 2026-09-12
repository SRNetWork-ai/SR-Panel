import { createService, listServices } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin, requireOwner } from "@/lib/auth"
import { toServiceDto } from "@/lib/dto"
import { serviceSchema } from "@/lib/schemas"

export const GET = route(async (req) => {
	const me = await requireAdmin()
	const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "1"
	const services = await listServices(me, { activeOnly })
	return ok({ services: services.map(toServiceDto) })
})

export const POST = route(async (req) => {
	const me = await requireOwner()
	const body = await parseBody(req, serviceSchema)
	return ok({ service: await createService(me, body) }, { status: 201 })
})
