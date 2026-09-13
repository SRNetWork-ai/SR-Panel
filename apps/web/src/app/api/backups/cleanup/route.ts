import { audit, cleanupBackups, reindexBackups } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

const input = z.object({ reindex: z.boolean().optional() })

export const POST = route(async (req) => {
	const me = await requireOwner()
	const body = await parseBody(req, input)
	const cleaned = await cleanupBackups()
	const imported = body.reindex ? (await reindexBackups()).imported : 0
	await audit(me.id, "backup.cleanup", null, { ...cleaned, imported })
	return ok({ ...cleaned, imported })
})
