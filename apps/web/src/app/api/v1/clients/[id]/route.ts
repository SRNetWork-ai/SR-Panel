import { deleteClient, getClientForActor, updateClient } from "@srpanel/core"
import { ok, parseBody, route, zId } from "@/lib/api"
import { requireApiKey } from "@/lib/apiAuth"
import { publicUrl, toClientDto } from "@/lib/dto"
import { updateClientSchema } from "@/lib/schemas"

export const GET = route<{ id: string }>(async (req, ctx) => {
	const { admin } = await requireApiKey(req, "read")
	const { id } = await ctx.params
	const client = await getClientForActor(admin, zId.parse(id))
	return ok({ client: toClientDto(client, publicUrl()) })
})

export const PATCH = route<{ id: string }>(async (req, ctx) => {
	const { admin } = await requireApiKey(req, "write")
	const { id } = await ctx.params
	const body = await parseBody(req, updateClientSchema)
	const { client, errors } = await updateClient(admin, zId.parse(id), body as any)
	return ok({ client: toClientDto(client, publicUrl()), errors })
})

export const DELETE = route<{ id: string }>(async (req, ctx) => {
	const { admin } = await requireApiKey(req, "write")
	const { id } = await ctx.params
	const errors = await deleteClient(admin, zId.parse(id))
	return ok({ ok: true, errors })
})
