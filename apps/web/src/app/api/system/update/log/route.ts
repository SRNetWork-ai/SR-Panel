import { readUpdateLog } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

/** Owner-only: incremental tail of the host agent's update log (live console). */
export const GET = route(async (req) => {
	await requireOwner()
	const raw = Number(new URL(req.url).searchParams.get("offset") ?? "0")
	return ok(await readUpdateLog(Number.isFinite(raw) && raw > 0 ? raw : 0))
})
