import { audit, getLogSettings, logSettingsSchema, setSetting } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { clientIp, requireOwner } from "@/lib/auth"

export const GET = route(async () => {
	await requireOwner()
	return ok(await getLogSettings())
})

export const PUT = route(async (req) => {
	const me = await requireOwner()
	const body = await parseBody(req, logSettingsSchema.partial())
	const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined))
	const saved = await setSetting("logs", logSettingsSchema, { ...(await getLogSettings()), ...patch })
	await audit(me.id, "settings.update", "logs", saved, await clientIp())
	return ok(saved)
})
