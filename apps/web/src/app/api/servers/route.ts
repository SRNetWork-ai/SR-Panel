import { createServer, listServersFor } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin, requireOwner } from "@/lib/auth"
import { toServerDto } from "@/lib/dto"
import { serverSchema } from "@/lib/schemas"

export const GET = route(async () => {
	const admin = await requireAdmin()
	const servers = await listServersFor(admin)
	const dtos = servers.map(toServerDto)
	// admins never see panel credentials / base URLs of servers they don't own
	if (admin.role !== "OWNER") for (const s of dtos) { s.baseUrl = ""; s.username = "" }
	return ok(dtos)
})

export const POST = route(async (req) => {
	await requireOwner()
	const body = await parseBody(req, serverSchema.required({ password: true }))
	const server = await createServer(body)
	return ok(toServerDto(server), { status: 201 })
})
