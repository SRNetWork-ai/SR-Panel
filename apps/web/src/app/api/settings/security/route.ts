import { audit, getSecuritySettings, loginSecuritySnapshot, saveSecuritySettings, securitySettingsSchema } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { clientIp, requireOwner } from "@/lib/auth"

const input = securitySettingsSchema.partial()

export const GET = route(async () => {
	await requireOwner()
	const [settings, snapshot] = await Promise.all([getSecuritySettings(), loginSecuritySnapshot()])
	return ok({ settings, snapshot })
})

export const PUT = route(async (req) => {
	const me = await requireOwner()
	const patch = await parseBody(req, input)
	const current = await getSecuritySettings()
	const settings = await saveSecuritySettings({ ...current, ...patch })
	await audit(me.id, "settings.update", "security", settings, await clientIp())
	return ok({ settings, snapshot: await loginSecuritySnapshot() })
})
