import { prisma } from "@srpanel/db"
import { z } from "zod"

/* ---------- typed settings stored in the Setting key/value table ---------- */

export const telegramSettingsSchema = z.object({
	enabled: z.boolean().default(false),
	botToken: z.string().trim().default(""),
	/** owner / alerts chat id (user, group or channel) */
	chatId: z.string().trim().default(""),
	botEnabled: z.boolean().default(true),
	notifyIncidents: z.boolean().default(true),
	notifyBackups: z.boolean().default(true),
	notifyExpiry: z.boolean().default(true),
	notifyTraffic: z.boolean().default(true),
	notifyLogins: z.boolean().default(false),
	/** also DM end-users that have a telegramId */
	notifyClientsDirect: z.boolean().default(false),
})
export type TelegramSettings = z.infer<typeof telegramSettingsSchema>

export const backupSettingsSchema = z.object({
	enabled: z.boolean().default(true),
	/** local hour (SRP_TZ) of the daily backup */
	hour: z.number().int().min(0).max(23).default(4),
	keepLast: z.number().int().min(1).max(90).default(7),
	sendToTelegram: z.boolean().default(true),
})
export type BackupSettings = z.infer<typeof backupSettingsSchema>

export const monitoringSettingsSchema = z.object({
	/** consecutive failed checks before an OFFLINE incident opens */
	failThreshold: z.number().int().min(1).max(10).default(2),
	cpuThreshold: z.number().int().min(50).max(100).default(90),
	expiryReminderDays: z.array(z.number().int().min(1).max(60)).default([3, 1]),
	trafficReminderPct: z.array(z.number().int().min(50).max(99)).default([80, 95]),
})
export type MonitoringSettings = z.infer<typeof monitoringSettingsSchema>

const cache = new Map<string, { at: number; value: unknown }>()
const TTL_MS = 30_000

export async function getSetting<S extends z.ZodTypeAny>(key: string, schema: S, ttl = TTL_MS): Promise<z.infer<S>> {
	const hit = cache.get(key)
	if (hit && Date.now() - hit.at < ttl) return hit.value as z.infer<S>
	const row = await prisma.setting.findUnique({ where: { key } })
	const parsed = schema.safeParse(row?.value ?? {})
	const value = parsed.success ? parsed.data : schema.parse({})
	cache.set(key, { at: Date.now(), value })
	return value
}

export async function setSetting<S extends z.ZodTypeAny>(key: string, schema: S, input: unknown): Promise<z.infer<S>> {
	const value = schema.parse(input)
	await prisma.setting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } })
	cache.set(key, { at: Date.now(), value })
	return value
}

export const getTelegramSettings = () => getSetting("telegram", telegramSettingsSchema)
export const getBackupSettings = () => getSetting("backup", backupSettingsSchema)
export const getMonitoringSettings = () => getSetting("monitoring", monitoringSettingsSchema)

/** Public URL of the panel (no trailing slash). */
export const panelUrl = () => (process.env.SRP_PUBLIC_URL || "http://localhost:3000").replace(/\/+$/, "")
export const brandName = () => process.env.SRP_BRAND_NAME || "SRPanel"
