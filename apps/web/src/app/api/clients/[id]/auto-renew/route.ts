import { clearAutoRenew, getAutoRenew, getClientForActor, setAutoRenew } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

const renewInput = z.object({
	everyDays: z.number().int().min(1).max(365),
	maxCycles: z.number().int().min(0).max(1000).optional(),
	extendExpiry: z.boolean().optional(),
	startAt: z.string().nullable().optional(),
})

export const GET = route<{ id: string }>(async (_req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	// scopes the lookup: a reseller may not read someone else's client
	const client = await getClientForActor(admin, id)
	return ok({ rule: await getAutoRenew(client.id) })
})

export const PUT = route<{ id: string }>(async (req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	const body = await parseBody(req, renewInput)
	return ok({ rule: await setAutoRenew(admin, id, body) })
})

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	await clearAutoRenew(admin, id)
	return ok({ rule: null })
})
