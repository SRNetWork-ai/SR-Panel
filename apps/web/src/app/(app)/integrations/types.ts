/* Shared types & helpers for the integrations screen. */

export const tr = (locale: string, fa: string, en: string) => (locale === "fa" ? fa : en)

export type TelegramForm = {
	enabled: boolean
	botToken: string
	botTokenMasked: string
	hasToken: boolean
	chatId: string
	botEnabled: boolean
	notifyIncidents: boolean
	notifyBackups: boolean
	notifyExpiry: boolean
	notifyTraffic: boolean
	notifyLogins: boolean
	notifyClientsDirect: boolean
}

export type ApiKeyRow = {
	id: string
	name: string
	prefix: string
	scopes: string[]
	lastUsedAt: string | null
	expiresAt: string | null
	revokedAt: string | null
	createdAt: string
}

export type WebhookRow = {
	id: string
	url: string
	secret: string
	events: string[]
	isActive: boolean
	lastStatus: number | null
	lastError: string | null
	lastFiredAt: string | null
	failCount: number
	createdAt: string
}

export type NotificationRow = {
	id: string
	at: string
	channel: string
	kind: string
	targetId: string | null
	adminId: string | null
	ok: boolean
	error: string | null
}

export type Tab = "telegram" | "apikeys" | "webhooks" | "notifications"

export function errMsg(err: unknown, fallback: string) {
	return err instanceof Error ? err.message : fallback
}

/* ---------- api keys ---------- */
export type KeyState = "active" | "expired" | "revoked"

export function keyState(k: ApiKeyRow): KeyState {
	if (k.revokedAt) return "revoked"
	if (k.expiresAt && new Date(k.expiresAt).getTime() < Date.now()) return "expired"
	return "active"
}

/** days offered in the create dialog; 0 = never expires */
export const EXPIRY_CHOICES = [0, 30, 90, 180, 365]

export function expiryIso(days: number): string | null {
	return days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null
}

/* ---------- webhooks ---------- */
export type WhState = "ok" | "fail" | "idle" | "off"

export function whState(w: WebhookRow): WhState {
	if (!w.isActive) return "off"
	if (w.lastStatus === null) return w.failCount > 0 ? "fail" : "idle"
	return w.lastStatus < 300 && w.failCount === 0 ? "ok" : "fail"
}

export function eventGroup(ev: string) {
	const i = ev.indexOf(".")
	return i > 0 ? ev.slice(0, i) : "other"
}

export function groupEvents(events: string[]): Array<{ group: string; items: string[] }> {
	const map = new Map<string, string[]>()
	for (const ev of [...events].sort()) {
		const g = eventGroup(ev)
		const arr = map.get(g)
		if (arr) arr.push(ev)
		else map.set(g, [ev])
	}
	return Array.from(map.entries()).map(([group, items]) => ({ group, items }))
}

/* ---------- notifications ---------- */
export function csvOf(rows: NotificationRow[]): string {
	const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
	const head = ["at", "channel", "kind", "target", "admin", "result", "error"]
	const body = rows.map((r) => [r.at, r.channel, r.kind, r.targetId, r.adminId, r.ok ? "ok" : "failed", r.error].map(esc).join(","))
	return [head.join(","), ...body].join("\n")
}

export function downloadText(name: string, text: string, mime = "text/csv;charset=utf-8") {
	const url = URL.createObjectURL(new Blob([text], { type: mime }))
	const a = document.createElement("a")
	a.href = url
	a.download = name
	a.click()
	URL.revokeObjectURL(url)
}
