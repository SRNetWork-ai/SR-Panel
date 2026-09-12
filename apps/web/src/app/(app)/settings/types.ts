import { ApiError } from "@/lib/client"

export type Brand = { name: string; tagline: string; logoUrl: string; primaryColor: string; accentColor: string; supportUrl: string; telegramUrl: string }
export type SystemInfo = { version: string; publicUrl: string; tz: string; agentHint: boolean }
export type Tab = "account" | "security" | "brand" | "appearance" | "system" | "tools"
export type Tone = "success" | "warning" | "danger" | "muted"

export const DEFAULT_PRIMARY = "#8b5cf6"
export const DEFAULT_ACCENT = "#22d3ee"

export const tr = (locale: string, fa: string, en: string) => (locale === "fa" ? fa : en)

const YEAR = 60 * 60 * 24 * 365

export function cookie(name: string, value: string) {
	document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`
}

export function resetPrefs() {
	const root = document.documentElement
	root.classList.remove("light", "srp-compact", "srp-calm")
	cookie("srp_theme", "dark")
	cookie("srp_compact", "0")
	cookie("srp_calm", "0")
}

export const errMsg = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)

export const fmtWhen = (iso: string | null, locale: string) => (iso ? new Date(iso).toLocaleString(locale === "fa" ? "fa-IR" : "en-US") : "—")

export const HEX = /^#[0-9a-f]{6}$/i
export const isHex = (v: string) => HEX.test(v)
export const isUrlish = (v: string) => v === "" || /^https?:\/\/\S+$/i.test(v)

/* ---------------- password strength ---------------- */

export type PwCheck = { id: string; label: string; ok: boolean }
export type PwScore = { score: number; label: string; tone: "danger" | "warning" | "success"; checks: PwCheck[] }

export function scorePassword(value: string, locale: string): PwScore {
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const checks: PwCheck[] = [
		{ id: "len", label: L("حداقل ۸ کاراکتر", "At least 8 characters"), ok: value.length >= 8 },
		{ id: "long", label: L("۱۲ کاراکتر یا بیشتر", "12 characters or more"), ok: value.length >= 12 },
		{ id: "case", label: L("حرف بزرگ و کوچک", "Upper and lower case"), ok: /[a-z]/.test(value) && /[A-Z]/.test(value) },
		{ id: "digit", label: L("شامل عدد", "Contains a number"), ok: /[0-9]/.test(value) },
		{ id: "sym", label: L("شامل علامت", "Contains a symbol"), ok: /[^A-Za-z0-9]/.test(value) },
	]
	const score = checks.filter((c) => c.ok).length
	const label = score <= 2 ? L("ضعیف", "Weak") : score <= 4 ? L("متوسط", "Fair") : L("قوی", "Strong")
	const tone: PwScore["tone"] = score <= 2 ? "danger" : score <= 4 ? "warning" : "success"
	return { score, label, tone, checks }
}

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*?-_"

export function makePassword(len = 18) {
	const buf = new Uint32Array(len)
	if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(buf)
	const out: string[] = []
	for (let i = 0; i < len; i += 1) {
		const n = buf[i] > 0 ? buf[i] : Math.floor(Math.random() * 1_000_000_000)
		out.push(ALPHABET[n % ALPHABET.length])
	}
	return out.join("")
}

/* ---------------- brand palettes ---------------- */

export type Palette = { id: string; fa: string; en: string; primary: string; accent: string }

export const PALETTES: Palette[] = [
	{ id: "aurora", fa: "شفق بنفش", en: "Aurora", primary: DEFAULT_PRIMARY, accent: DEFAULT_ACCENT },
	{ id: "sunset", fa: "غروب", en: "Sunset", primary: "#f97316", accent: "#ec4899" },
	{ id: "emerald", fa: "زمرد", en: "Emerald", primary: "#10b981", accent: "#38bdf8" },
	{ id: "royal", fa: "سلطنتی", en: "Royal", primary: "#2563eb", accent: "#a855f7" },
	{ id: "magma", fa: "ماگما", en: "Magma", primary: "#ef4444", accent: "#f59e0b" },
	{ id: "graphite", fa: "نقره‌ای", en: "Graphite", primary: "#64748b", accent: "#94a3b8" },
]

function luminance(hex: string) {
	const v = hex.replace("#", "")
	const parts = [0, 2, 4]
		.map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
		.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
	return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]
}

/** Contrast of white text over the given colour (WCAG ratio, 1–21). */
export function contrastOnWhite(hex: string) {
	if (!isHex(hex)) return 0
	return Math.round((1.05 / (luminance(hex) + 0.05)) * 100) / 100
}

/* ---------------- diagnostics ---------------- */

export type Diag = { id: string; label: string; value: string; tone: Tone }

export function collectDiagnostics(locale: string, info: SystemInfo): Diag[] {
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "—"
	const secure = window.isSecureContext
	const cookies = navigator.cookieEnabled
	const online = navigator.onLine
	const clip = typeof navigator.clipboard !== "undefined"
	const ua = navigator.userAgent
	return [
		{ id: "https", label: L("اتصال امن (HTTPS)", "Secure connection (HTTPS)"), value: secure ? L("برقرار", "Yes") : L("برقرار نیست", "No"), tone: secure ? "success" : "danger" },
		{ id: "cookie", label: L("کوکی مرورگر", "Browser cookies"), value: cookies ? L("فعال", "Enabled") : L("مسدود", "Blocked"), tone: cookies ? "success" : "danger" },
		{ id: "online", label: L("وضعیت شبکه", "Network"), value: online ? L("آنلاین", "Online") : L("آفلاین", "Offline"), tone: online ? "success" : "warning" },
		{ id: "clip", label: L("کلیپ‌بورد", "Clipboard API"), value: clip ? L("در دسترس", "Available") : L("پشتیبانی نمی‌شود", "Unavailable"), tone: clip ? "success" : "warning" },
		{ id: "tz", label: L("منطقه زمانی مرورگر", "Browser timezone"), value: browserTz, tone: browserTz === info.tz ? "success" : "warning" },
		{ id: "srvtz", label: L("منطقه زمانی سرور", "Server timezone"), value: info.tz, tone: "muted" },
		{ id: "lang", label: L("زبان مرورگر", "Browser language"), value: navigator.language || "—", tone: "muted" },
		{ id: "screen", label: L("صفحه نمایش", "Screen"), value: `${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x`, tone: "muted" },
		{ id: "view", label: L("اندازه پنجره", "Viewport"), value: `${window.innerWidth}×${window.innerHeight}`, tone: "muted" },
		{ id: "ver", label: L("نسخه پنل", "Panel version"), value: info.version, tone: "muted" },
		{ id: "url", label: L("آدرس عمومی", "Public URL"), value: info.publicUrl || L("تنظیم نشده", "Not set"), tone: info.publicUrl ? "success" : "warning" },
		{ id: "ua", label: L("مرورگر", "Browser"), value: ua.length > 84 ? `${ua.slice(0, 84)}…` : ua, tone: "muted" },
	]
}

export function diagText(rows: Diag[]) {
	return rows.map((d) => `${d.label}: ${d.value}`).join("\n")
}

export function downloadText(name: string, text: string) {
	const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }))
	const a = document.createElement("a")
	a.href = url
	a.download = name
	a.click()
	URL.revokeObjectURL(url)
}
