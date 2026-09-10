/* Pure formatting helpers — safe for both server and client components. */

export const GB = 1024 ** 3

export function formatBytes(b: number | null | undefined, digits = 1): string {
	const n = Number(b ?? 0)
	if (!Number.isFinite(n) || n <= 0) return "0 B"
	const units = ["B", "KB", "MB", "GB", "TB", "PB"]
	const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
	return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : digits)} ${units[i]}`
}

export const bytesToGb = (b: number, digits = 2) => Number((b / GB).toFixed(digits))

export function percent(used: number, total: number): number {
	if (!total || total <= 0) return 0
	return Math.min(100, Math.round((used / total) * 100))
}

export function daysLeft(iso: string | null | undefined): number | null {
	if (!iso) return null
	return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

export type Locale = "fa" | "en"

export function formatDate(iso: string | Date | null | undefined, locale: Locale = "fa", withTime = false): string {
	if (!iso) return "—"
	const d = typeof iso === "string" ? new Date(iso) : iso
	if (Number.isNaN(d.getTime())) return "—"
	return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-GB", {
		year: "numeric",
		month: "short",
		day: "numeric",
		...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
	}).format(d)
}

export function relativeTime(iso: string | null | undefined, locale: Locale = "fa"): string {
	if (!iso) return "—"
	const diff = (new Date(iso).getTime() - Date.now()) / 1000
	const rtf = new Intl.RelativeTimeFormat(locale === "fa" ? "fa" : "en", { numeric: "auto" })
	const abs = Math.abs(diff)
	if (abs < 60) return rtf.format(Math.round(diff), "second")
	if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute")
	if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour")
	return rtf.format(Math.round(diff / 86400), "day")
}

export function formatNumber(n: number, locale: Locale = "fa"): string {
	return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(n)
}

export function statusTone(status: string): "success" | "warning" | "danger" | "muted" {
	switch (status) {
		case "ACTIVE":
		case "ONLINE":
			return "success"
		case "LIMITED":
		case "UNKNOWN":
			return "warning"
		case "EXPIRED":
		case "OFFLINE":
		case "AUTH_ERROR":
			return "danger"
		default:
			return "muted"
	}
}

export function usageTone(pct: number): "" | "warn" | "danger" {
	if (pct >= 90) return "danger"
	if (pct >= 70) return "warn"
	return ""
}
