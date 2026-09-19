import { clearClientIps, clientIps } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

/** Read-only on the client itself: this only touches the panel's own IP log. */
export const GET = route<{ id: string }>(async (_req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	return ok(await clientIps(admin, id))
})

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	return ok(await clearClientIps(admin, id))
})
