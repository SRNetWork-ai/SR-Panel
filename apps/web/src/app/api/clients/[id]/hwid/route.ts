import { clearClientDevices, clientDevices, setClientHwidLimit } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

const hwidInput = z.object({ limit: z.number().int().min(0).max(100) })

export const GET = route<{ id: string }>(async (_req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	return ok(await clientDevices(admin, id))
})

export const PUT = route<{ id: string }>(async (req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	const body = await parseBody(req, hwidInput)
	return ok(await setClientHwidLimit(admin, id, body.limit))
})

/** Releases the devices bound on every panel of the client. */
export const DELETE = route<{ id: string }>(async (_req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	return ok(await clearClientDevices(admin, id))
})
