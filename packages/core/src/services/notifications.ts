/**
 * Telegram notifications with dedupe (NotificationLog) + webhook fan-out for status changes.
 * Never throws — notification failures must not break business flows.
 */
import { prisma, type ClientStatus } from "@srpanel/db"
import { formatBytes } from "../util/bytes"
import { brandName, getMonitoringSettings, getTelegramSettings, panelUrl, type TelegramSettings } from "./settings"
import { tgEscape, tgSendMessage } from "./telegram"
import { emitEvent } from "./webhooks"

export const TZ = () => process.env.SRP_TZ || "Asia/Tehran"

export function fmtDate(d: Date | string | null | undefined, withTime = true): string {
	if (!d) return "—"
	const date = typeof d === "string" ? new Date(d) : d
	try {
		return date.toLocaleString("fa-IR", { timeZone: TZ(), dateStyle: "medium", ...(withTime ? { timeStyle: "short" } : {}) })
	} catch {
		return date.toISOString()
	}
}

export function fmtDuration(ms: number): string {
	const m = Math.max(1, Math.round(ms / 60_000))
	if (m < 60) return `${m} دقیقه`
	const h = Math.floor(m / 60)
	if (h < 48) return `${h} ساعت و ${m % 60} دقیقه`
	return `${Math.floor(h / 24)} روز`
}

export type Recipients = { adminId?: string | null; clientTelegramId?: string | null; ownerOnly?: boolean }

async function recipientsFor(s: TelegramSettings, r: Recipients): Promise<string[]> {
	const ids = new Set<string>()
	if (s.chatId) ids.add(s.chatId)
	if (!r.ownerOnly && r.adminId) {
		const a = await prisma.admin.findUnique({ where: { id: r.adminId }, select: { telegramId: true, isActive: true } })
		if (a?.telegramId && a.isActive) ids.add(a.telegramId)
	}
	if (!r.ownerOnly && s.notifyClientsDirect && r.clientTelegramId) ids.add(r.clientTelegramId)
	return [...ids]
}

/** Sends one Telegram notification per dedupeKey (owner chat + optional admin / client). */
export async function notify(kind: string, text: string, opts: { dedupeKey: string; targetId?: string | null; recipients?: Recipients }): Promise<boolean> {
	try {
		const s = await getTelegramSettings()
		if (!s.enabled || !s.botToken) return false
		if (await prisma.notificationLog.findUnique({ where: { dedupeKey: opts.dedupeKey } })) return false
		const chats = await recipientsFor(s, opts.recipients ?? {})
		let ok = false
		let error: string | null = chats.length ? null : "no recipients"
		for (const chatId of chats) {
			const r = await tgSendMessage(text, { chatId })
			if (r.ok) ok = true
			else error = r.error
		}
		await prisma.notificationLog.create({
			data: { kind, targetId: opts.targetId ?? null, adminId: opts.recipients?.adminId ?? null, dedupeKey: opts.dedupeKey, ok, error: ok ? null : error },
		})
		return ok
	} catch (err) {
		console.error("[srpanel] notify failed:", err instanceof Error ? err.message : err)
		return false
	}
}

/* ---------- message builders ---------- */

type ClientLite = { id: string; name: string; adminId: string; status: ClientStatus; expiresAt: Date | null; trafficLimit: bigint; usedUp: bigint; usedDown: bigint; telegramId: string | null; subToken: string }
const clientSelect = { id: true, name: true, adminId: true, status: true, expiresAt: true, trafficLimit: true, usedUp: true, usedDown: true, telegramId: true, subToken: true } as const

function usageLine(c: ClientLite): string {
	const used = Number(c.usedUp + c.usedDown)
	const limit = Number(c.trafficLimit)
	return limit > 0 ? `📦 ${formatBytes(used)} / ${formatBytes(limit)} (${Math.min(100, Math.round((used / limit) * 100))}%)` : `📦 ${formatBytes(used)} / نامحدود`
}

function clientCard(title: string, c: ClientLite, adminName?: string | null): string {
	const lines = [
		`${title}`,
		`👤 <b>${tgEscape(c.name)}</b>`,
		usageLine(c),
		`📅 انقضا: ${fmtDate(c.expiresAt, false)}`,
	]
	if (adminName) lines.push(`🧑‍💼 ادمین: ${tgEscape(adminName)}`)
	lines.push(`🔗 ${panelUrl()}/s/${c.subToken}`)
	return lines.join("\n")
}

async function adminName(adminId: string): Promise<string | null> {
	const a = await prisma.admin.findUnique({ where: { id: adminId }, select: { username: true, displayName: true } })
	return a ? a.displayName || a.username : null
}

/* ---------- hooks ---------- */

/** Called by the sync/enforce code when a client flips to EXPIRED or LIMITED. */
export async function onClientStatusChanged(clientId: string, status: ClientStatus): Promise<void> {
	if (status !== "EXPIRED" && status !== "LIMITED") return
	try {
		const c = await prisma.client.findUnique({ where: { id: clientId }, select: clientSelect })
		if (!c) return
		const event = status === "EXPIRED" ? "client.expired" : "client.limited"
		await emitEvent(c.adminId, event, { target: c.id })
		const s = await getTelegramSettings()
		if ((status === "EXPIRED" && !s.notifyExpiry) || (status === "LIMITED" && !s.notifyTraffic)) return
		const title = status === "EXPIRED" ? "⛔️ <b>اشتراک کلاینت منقضی شد</b>" : "📛 <b>حجم کلاینت به پایان رسید</b>"
		const key = status === "EXPIRED" ? `client.expired:${c.id}:${c.expiresAt?.getTime() ?? 0}` : `client.limited:${c.id}:${c.trafficLimit.toString()}:${new Date().toISOString().slice(0, 7)}`
		await notify(event, clientCard(title, c, await adminName(c.adminId)), { dedupeKey: key, targetId: c.id, recipients: { adminId: c.adminId, clientTelegramId: c.telegramId } })
	} catch (err) {
		console.error("[srpanel] onClientStatusChanged failed:", err instanceof Error ? err.message : err)
	}
}

/** Called from audit(): login alerts (owner only). */
export async function onAuditEvent(adminId: string | null, action: string, target: string | null, _meta?: Record<string, unknown>, ip?: string | null): Promise<void> {
	try {
		if (action !== "auth.login" && action !== "auth.login_failed") return
		const s = await getTelegramSettings()
		if (!s.notifyLogins) return
		const bucket = Math.floor(Date.now() / (action === "auth.login" ? 1 : 600_000))
		const text = action === "auth.login"
			? `🔐 <b>ورود به پنل ${tgEscape(brandName())}</b>\n👤 ${tgEscape(target)}\n🌐 IP: <code>${tgEscape(ip ?? "—")}</code>\n🕒 ${fmtDate(new Date())}`
			: `⚠️ <b>ورود ناموفق</b>\n👤 ${tgEscape(target)}\n🌐 IP: <code>${tgEscape(ip ?? "—")}</code>\n🕒 ${fmtDate(new Date())}`
		await notify(action, text, { dedupeKey: `${action}:${target}:${bucket}`, targetId: adminId, recipients: { ownerOnly: true } })
	} catch {
		/* ignore */
	}
}

/* ---------- scheduled reminders (worker) ---------- */

export async function runReminders(): Promise<{ expiry: number; traffic: number; admins: number }> {
	const out = { expiry: 0, traffic: 0, admins: 0 }
	const s = await getTelegramSettings()
	if (!s.enabled || !s.botToken) return out
	const m = await getMonitoringSettings()
	const now = Date.now()
	const DAY = 86_400_000

	if (s.notifyExpiry && m.expiryReminderDays.length) {
		const thresholds = [...m.expiryReminderDays].sort((a, b) => a - b)
		const maxDays = thresholds[thresholds.length - 1]!
		const clients = await prisma.client.findMany({
			where: { status: "ACTIVE", expiresAt: { gt: new Date(now), lte: new Date(now + maxDays * DAY) } },
			select: clientSelect,
		})
		for (const c of clients) {
			const daysLeft = Math.ceil((c.expiresAt!.getTime() - now) / DAY)
			const t = thresholds.find((x) => daysLeft <= x)
			if (!t) continue
			const title = `⏳ <b>${daysLeft} روز تا انقضای اشتراک</b>`
			const ok = await notify("client.expiring", clientCard(title, c, await adminName(c.adminId)), {
				dedupeKey: `client.expiring_${t}:${c.id}:${c.expiresAt!.getTime()}`,
				targetId: c.id,
				recipients: { adminId: c.adminId, clientTelegramId: c.telegramId },
			})
			if (ok) out.expiry++
		}

		const admins = await prisma.admin.findMany({
			where: { isActive: true, role: "ADMIN", expiresAt: { gt: new Date(now), lte: new Date(now + maxDays * DAY) } },
			select: { id: true, username: true, displayName: true, expiresAt: true },
		})
		for (const a of admins) {
			const daysLeft = Math.ceil((a.expiresAt!.getTime() - now) / DAY)
			const t = thresholds.find((x) => daysLeft <= x)
			if (!t) continue
			const text = `⏳ <b>${daysLeft} روز تا انقضای حساب ادمین</b>\n🧑‍💼 ${tgEscape(a.displayName || a.username)}\n📅 ${fmtDate(a.expiresAt, false)}`
			const ok = await notify("admin.expiring", text, { dedupeKey: `admin.expiring_${t}:${a.id}:${a.expiresAt!.getTime()}`, targetId: a.id, recipients: { adminId: a.id } })
			if (ok) out.admins++
		}
	}

	if (s.notifyTraffic && m.trafficReminderPct.length) {
		const thresholds = [...m.trafficReminderPct].sort((a, b) => b - a) // largest first
		const clients = await prisma.client.findMany({ where: { status: "ACTIVE", trafficLimit: { gt: 0 } }, select: clientSelect })
		const month = new Date().toISOString().slice(0, 7)
		for (const c of clients) {
			const pct = (Number(c.usedUp + c.usedDown) / Number(c.trafficLimit)) * 100
			const t = thresholds.find((x) => pct >= x)
			if (!t) continue
			const title = `📊 <b>مصرف حجم به ${t}% رسید</b>`
			const ok = await notify("client.traffic", clientCard(title, c, await adminName(c.adminId)), {
				dedupeKey: `client.traffic_${t}:${c.id}:${c.trafficLimit.toString()}:${month}`,
				targetId: c.id,
				recipients: { adminId: c.adminId, clientTelegramId: c.telegramId },
			})
			if (ok) out.traffic++
		}
	}
	return out
}

/** Recent notification log for the UI. */
export async function listNotifications(take = 50) {
	return prisma.notificationLog.findMany({ orderBy: { at: "desc" }, take })
}
