import { clientUsageSeries, getClientForActor } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

export const GET = route<{ id: string }>(async (req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	await getClientForActor(admin, id) // 404/403 guard
	const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)))
	return ok(await clientUsageSeries(id, days))
})
