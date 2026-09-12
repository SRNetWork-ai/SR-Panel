import type { UpdateOverview } from "@srpanel/core"

/* Shared types & helpers for the panel-update screen. */

export type LogResp = { size: number; offset: number; chunk: string; state: string; step: string }
export type Job = NonNullable<UpdateOverview["job"]>
export type Latest = NonNullable<UpdateOverview["latest"]>
export type Agent = NonNullable<UpdateOverview["agent"]>

export const STEPS = ["source", "build", "health"] as const
export type Step = (typeof STEPS)[number]

export const AGENT_CMD = "SR agent install"
export const IDLE_POLL_MS = 30_000
export const BUSY_POLL_MS = 2_000

export const tr = (locale: string, fa: string, en: string) => (locale === "fa" ? fa : en)

export const shortSha = (sha?: string | null) => (sha ? sha.slice(0, 7) : "—")

export function clock(totalSec: number): string {
	const s = Math.max(0, Math.round(totalSec))
	const m = Math.floor(s / 60)
	return `${m}:${String(s % 60).padStart(2, "0")}`
}

export function fmtDate(iso: string | null | undefined, locale: string) {
	return iso ? new Date(iso).toLocaleString(locale === "fa" ? "fa-IR" : "en-GB") : "—"
}

export function jobState(data: UpdateOverview): string {
	return data.pending ? "queued" : data.job?.state ?? "idle"
}

export function isRunning(state: string) {
	return state === "running" || state === "checking" || state === "queued"
}

export function stepIndexOf(step: string | null | undefined) {
	return STEPS.indexOf((step ?? "") as Step)
}

export function progressOf(state: string, stepIndex: number) {
	if (state === "success") return 100
	if (state === "queued") return 4
	if (isRunning(state)) return Math.min(96, ((Math.max(stepIndex, 0) + 0.5) / STEPS.length) * 100)
	if (state === "failed") return Math.max(10, ((Math.max(stepIndex, 0) + 1) / STEPS.length) * 100)
	return 0
}

export function elapsedOf(job: Job | null | undefined, running: boolean) {
	if (job?.startedAt && running) return (Date.now() - Date.parse(job.startedAt)) / 1000
	if (job?.startedAt && job.finishedAt) return (Date.parse(job.finishedAt) - Date.parse(job.startedAt)) / 1000
	return 0
}

export function stepLabel(s: Step, locale: string) {
	if (s === "source") return tr(locale, "دریافت سورس", "Fetch source")
	if (s === "build") return tr(locale, "ساخت و راه‌اندازی", "Build and start")
	return tr(locale, "بررسی سلامت", "Health check")
}

/** rough log colouring for the live console */
export type LineTone = "err" | "warn" | "ok" | ""

export function logLineTone(line: string): LineTone {
	const l = line.toLowerCase()
	if (/error|failed|fatal|cannot|exception|\bko\b/.test(l)) return "err"
	if (/warn|deprecated|skipping|retry/.test(l)) return "warn"
	if (/success|completed|healthy|\bdone\b|\bok\b|ready/.test(l)) return "ok"
	return ""
}

export function downloadLog(log: string) {
	const url = URL.createObjectURL(new Blob([log || ""], { type: "text/plain;charset=utf-8" }))
	const a = document.createElement("a")
	a.href = url
	a.download = `srpanel-update-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`
	document.body.appendChild(a)
	a.click()
	a.remove()
	URL.revokeObjectURL(url)
}
