import { serverDetail } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

/** Everything the server detail screen needs; `hours` picks the metric window (1-168). */
export const GET = route<{ id: string }>(async (req, { params }) => {
	await requireOwner()
	const { id } = await params
	const raw = Number(new URL(req.url).searchParams.get("hours"))
	const hours = Number.isFinite(raw) && raw > 0 ? raw : undefined
	return ok(await serverDetail(id, { hours }))
})
