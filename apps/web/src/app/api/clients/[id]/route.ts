import { deleteClient, getClientForActor, updateClient } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { publicUrl, toClientDto } from "@/lib/dto"
import { updateClientSchema } from "@/lib/schemas"

export const GET = route<{ id: string }>(async (_req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	const client = await getClientForActor(admin, id)
	return ok(toClientDto(client, publicUrl()))
})

export const PATCH = route<{ id: string }>(async (req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	const body = await parseBody(req, updateClientSchema)
	const { client, errors } = await updateClient(admin, id, body)
	return ok({ client: toClientDto(client, publicUrl()), errors })
})

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	const errors = await deleteClient(admin, id)
	return ok({ ok: true, errors })
})
