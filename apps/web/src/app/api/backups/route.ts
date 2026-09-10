import { audit, listBackups, runBackup } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

export const GET = route(async () => {
	await requireOwner()
	return ok(await listBackups())
})

export const POST = route(async () => {
	const me = await requireOwner()
	const backup = await runBackup("manual")
	await audit(me.id, "backup.run", backup.id, { status: backup.status, fileName: backup.fileName })
	return ok({ backup }, { status: 201 })
})
