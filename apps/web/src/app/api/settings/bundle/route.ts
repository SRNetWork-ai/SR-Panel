import {
	audit,
	backupSettingsSchema,
	getBackupSettings,
	getLogSettings,
	getMonitoringSettings,
	getTelegramSettings,
	getUpdateSettings,
	logSettingsSchema,
	monitoringSettingsSchema,
	setSetting,
	telegramSettingsSchema,
	updateSettingsSchema,
} from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { clientIp, requireOwner } from "@/lib/auth"

/**
 * Portable snapshot of the panel-wide policies (Setting table only).
 * Never contains secrets, admins, servers or customer data, so the file is safe to move
 * between installs. Sections are optional: an import only touches what the file carries.
 */
const KIND = "srpanel-settings"
const VERSION = 1

/** the bot token never leaves the server */
const telegramSafeSchema = telegramSettingsSchema.omit({ botToken: true })

const bundleInput = z.object({
	kind: z.string().max(40).optional(),
	version: z.number().int().min(1).max(99).optional(),
	exportedAt: z.string().max(40).optional(),
	settings: z.object({
		monitoring: monitoringSettingsSchema.partial().optional(),
		backup: backupSettingsSchema.partial().optional(),
		logs: logSettingsSchema.partial().optional(),
		updates: updateSettingsSchema.partial().optional(),
		telegram: telegramSafeSchema.partial().optional(),
	}),
})

export const GET = route(async () => {
	await requireOwner()
	const [monitoring, backup, logs, updates, telegram] = await Promise.all([
		getMonitoringSettings(),
		getBackupSettings(),
		getLogSettings(),
		getUpdateSettings(),
		getTelegramSettings(),
	])
	return ok({
		kind: KIND,
		version: VERSION,
		exportedAt: new Date().toISOString(),
		settings: { monitoring, backup, logs, updates, telegram: telegramSafeSchema.parse(telegram) },
	})
})

export const POST = route(async (req) => {
	const me = await requireOwner()
	const body = await parseBody(req, bundleInput)
	const s = body.settings
	const applied: string[] = []

	if (s.monitoring) {
		await setSetting("monitoring", monitoringSettingsSchema, { ...(await getMonitoringSettings()), ...s.monitoring })
		applied.push("monitoring")
	}
	if (s.backup) {
		await setSetting("backup", backupSettingsSchema, { ...(await getBackupSettings()), ...s.backup })
		applied.push("backup")
	}
	if (s.logs) {
		await setSetting("logs", logSettingsSchema, { ...(await getLogSettings()), ...s.logs })
		applied.push("logs")
	}
	if (s.updates) {
		await setSetting("updates", updateSettingsSchema, { ...(await getUpdateSettings()), ...s.updates })
		applied.push("updates")
	}
	if (s.telegram) {
		const prev = await getTelegramSettings()
		await setSetting("telegram", telegramSettingsSchema, { ...prev, ...s.telegram, botToken: prev.botToken })
		applied.push("telegram")
	}

	if (applied.length) await audit(me.id, "settings.update", "bundle", { applied }, await clientIp())
	return ok({ applied })
})
