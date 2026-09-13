import { backupSettingsSchema, getBackupSettings, setSetting } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { backupSettingsInput } from "@/lib/schemas"

/** smart-backup fields stay optional so an older client keeps working */
const input = backupSettingsInput.extend({
	extraHours: z.array(z.number().int().min(0).max(23)).max(11).optional(),
	keepDays: z.number().int().min(0).max(365).optional(),
	verify: z.boolean().optional(),
	autoCleanup: z.boolean().optional(),
	staleAfterHours: z.number().int().min(0).max(720).optional(),
})

export const GET = route(async () => {
	await requireOwner()
	return ok(await getBackupSettings())
})

export const PUT = route(async (req) => {
	await requireOwner()
	const body = await parseBody(req, input)
	const current = await getBackupSettings()
	return ok(await setSetting("backup", backupSettingsSchema, { ...current, ...body }))
})
