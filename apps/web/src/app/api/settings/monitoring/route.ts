import { getMonitoringSettings, monitoringSettingsSchema, setSetting } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { monitoringSettingsInput } from "@/lib/schemas"

export const GET = route(async () => {
	await requireOwner()
	return ok(await getMonitoringSettings())
})

export const PUT = route(async (req) => {
	await requireOwner()
	const body = await parseBody(req, monitoringSettingsInput)
	return ok(await setSetting("monitoring", monitoringSettingsSchema, body))
})
