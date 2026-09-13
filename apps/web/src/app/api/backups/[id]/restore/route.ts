import { audit, restoreBackup } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route, zId } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

/** the owner must retype the exact file name to confirm */
const input = z.object({ fileName: z.string().min(1).max(200), safetyBackup: z.boolean().optional() })

export const POST = route<{ id: string }>(async (req, ctx) => {
	const me = await requireOwner()
	const { id } = await ctx.params
	const body = await parseBody(req, input)
	const res = await restoreBackup(zId.parse(id), { confirmFileName: body.fileName, safetyBackup: body.safetyBackup })
	await audit(me.id, "backup.restore", id, { fileName: res.fileName, safetyBackupId: res.safetyBackupId, durationMs: res.durationMs, imported: res.imported })
	return ok(res)
})
