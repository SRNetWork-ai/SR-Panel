import { assertClientKind, deleteClientWithRefund, getClientForActor, kindFromGB, updateClient } from "@srpanel/core"
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
	// switching a client between «حجمی» and «نامحدود» needs the same permission as creating one
	if (body.trafficGB !== undefined) await assertClientKind(admin, kindFromGB(body.trafficGB))
	const { client, errors } = await updateClient(admin, id, body)
	return ok({ client: toClientDto(client, publicUrl()), errors })
})

/** Deleting also returns the unused part of the purchase to the reseller wallet. */
export const DELETE = route<{ id: string }>(async (_req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	const { errors, refund } = await deleteClientWithRefund(admin, id)
	return ok({ ok: true, errors, refund })
})
