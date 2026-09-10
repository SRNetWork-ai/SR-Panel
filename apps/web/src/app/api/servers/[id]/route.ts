import { NotFoundError, deleteServer, updateServer } from "@srpanel/core"
import { prisma } from "@srpanel/db"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { toServerDto } from "@/lib/dto"
import { serverSchema } from "@/lib/schemas"

export const GET = route<{ id: string }>(async (_req, { params }) => {
	await requireOwner()
	const { id } = await params
	const server = await prisma.server.findUnique({ where: { id }, include: { _count: { select: { clients: true } } } })
	if (!server) throw new NotFoundError("سرور پیدا نشد")
	const { _count, ...rest } = server
	return ok(toServerDto({ ...rest, clientCount: _count.clients }))
})

export const PATCH = route<{ id: string }>(async (req, { params }) => {
	await requireOwner()
	const { id } = await params
	const body = await parseBody(req, serverSchema.partial())
	const server = await updateServer(id, body)
	return ok(toServerDto(server))
})

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
	await requireOwner()
	const { id } = await params
	await deleteServer(id)
	return ok({ ok: true })
})
