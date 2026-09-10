import { backupSettingsSchema, getBackupSettings, setSetting } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { backupSettingsInput } from "@/lib/schemas"

export const GET = route(async () => {
	await requireOwner()
	return ok(await getBackupSettings())
})

export const PUT = route(async (req) => {
	await requireOwner()
	const body = await parseBody(req, backupSettingsInput)
	return ok(await setSetting("backup", backupSettingsSchema, body))
})
