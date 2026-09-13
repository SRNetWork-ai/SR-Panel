import { audit, verifyBackup } from "@srpanel/core"
import { ok, route, zId } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

export const POST = route<{ id: string }>(async (_req, ctx) => {
	const me = await requireOwner()
	const { id } = await ctx.params
	const check = await verifyBackup(zId.parse(id))
	await audit(me.id, "backup.verify", id, { ok: check.ok, tables: check.tables, sha256: check.sha256.slice(0, 16), error: check.error ?? null })
	return ok(check)
})
