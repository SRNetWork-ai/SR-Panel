import { audit, getUpdateSettings, readUpdateLastRun, setSetting, updateSettingsSchema } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { clientIp, requireOwner } from "@/lib/auth"

/** Owner-only: automatic update policy + what the previous run cost. */
export const GET = route(async () => {
	await requireOwner()
	return ok({ settings: await getUpdateSettings(), lastRun: await readUpdateLastRun() })
})

export const PUT = route(async (req) => {
	const me = await requireOwner()
	const body = await parseBody(req, updateSettingsSchema.partial())
	const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined))
	const saved = await setSetting("updates", updateSettingsSchema, { ...(await getUpdateSettings()), ...patch })
	await audit(me.id, "settings.update", "updates", saved, await clientIp())
	return ok({ settings: saved, lastRun: await readUpdateLastRun() })
})
