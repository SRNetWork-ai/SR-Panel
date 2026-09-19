import { exportClientsCsv } from "@srpanel/core"
import { route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

/** CSV of the current filter, not just the visible page. */
export const GET = route(async (req) => {
	const admin = await requireAdmin()
	const sp = new URL(req.url).searchParams
	const csv = await exportClientsCsv(admin, { q: sp.get("q") || undefined, status: sp.get("status") || undefined })
	const name = `srpanel-clients-${new Date().toISOString().slice(0, 10)}.csv`
	return new Response(csv, {
		headers: {
			"content-type": "text/csv; charset=utf-8",
			"content-disposition": `attachment; filename="${name}"`,
			"cache-control": "no-store",
		},
	})
})
