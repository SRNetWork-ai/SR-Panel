import { importClientsCsv } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

const importInput = z.object({
	csv: z.string().min(1).max(2_000_000),
	/** validate the file without creating anything */
	dryRun: z.boolean().optional(),
})

export const POST = route(async (req) => {
	const admin = await requireAdmin()
	const body = await parseBody(req, importInput)
	return ok(await importClientsCsv(admin, body.csv, body.dryRun ?? false))
})
