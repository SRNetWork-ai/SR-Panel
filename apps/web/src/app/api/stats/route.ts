import { dashboardStats, serverMetrics } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireAdmin, requireOwner } from "@/lib/auth"

export const GET = route(async (req) => {
	const serverId = req.nextUrl.searchParams.get("serverId")
	if (serverId) {
		await requireOwner()
		const hours = Math.min(168, Math.max(1, Number(req.nextUrl.searchParams.get("hours") ?? 24)))
		return ok(await serverMetrics(serverId, hours))
	}
	const admin = await requireAdmin()
	return ok(await dashboardStats(admin))
})
