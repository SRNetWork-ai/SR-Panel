import { clientBulkSchema, runClientBulk } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

/**
 * One bulk action over a selection (`ids`) or a saved filter.
 *
 * Client management stays free (see lib/premium.ts), so this route is not gated.
 * The core service caps how many clients one call may touch; the UI slices a
 * bigger selection and repeats a filter run until nothing is left.
 */
export const POST = route(async (req) => {
	const admin = await requireAdmin()
	const body = await parseBody(req, clientBulkSchema)
	return ok(await runClientBulk(admin, body))
})
