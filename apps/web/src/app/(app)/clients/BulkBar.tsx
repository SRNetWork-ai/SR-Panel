"use client"

import { useState } from "react"
import { AlertTriangle, Check, Clock, Layers, RefreshCw, RotateCcw, Trash2 } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Button, Card, Field, Input, Modal, useConfirm, useToast } from "@/components/ui"

/** Mirrors ClientBulkResult in @srpanel/core. */
type BulkResult = {
	requested: number
	done: number
	skipped: number
	failed: number
	refund: string
	warnings: string[]
	errors: Array<{ id: string; name: string; message: string }>
}

/** Mirrors ClientOverview in @srpanel/core. */
export type ClientOverview = {
	total: number
	active: number
	expired: number
	limited: number
	disabled: number
	expiring: number
	online: number
	broken: number
	orphan: number
	stale: number
	staleDays: number
}

type BulkAction = "enable" | "disable" | "addDays" | "addGb" | "resetTraffic" | "repush" | "delete"
type BulkFilter = { broken?: boolean; orphan?: boolean; expiredBeforeDays?: number }
type BulkPayload = { ids?: string[]; filter?: BulkFilter; days?: number; gb?: number }
/** one row of the maintenance card */
type MaintenanceRow = { key: string; count: number; label: string; hint: string; action: BulkAction; filter: BulkFilter; danger: boolean }

/** The API caps one call, so a bigger selection goes out in slices. */
const CHUNK = 20
/** Safety net for filter runs: every round takes the next batch. */
const ROUNDS = 12

const emptyResult = (): BulkResult => ({ requested: 0, done: 0, skipped: 0, failed: 0, refund: "0", warnings: [], errors: [] })

function mergeResults(a: BulkResult, b: BulkResult): BulkResult {
	return {
		requested: a.requested + b.requested,
		done: a.done + b.done,
		skipped: a.skipped + b.skipped,
		failed: a.failed + b.failed,
		refund: (BigInt(a.refund || "0") + BigInt(b.refund || "0")).toString(),
		warnings: [...a.warnings, ...b.warnings].slice(0, 12),
		errors: [...a.errors, ...b.errors].slice(0, 20),
	}
}

/** Shared runner: slices the work, shows progress and sums everything into one toast. */
function useBulkRunner(onDone: () => void) {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const [busy, setBusy] = useState<BulkAction | null>(null)
	const [progress, setProgress] = useState("")
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)

	const post = (action: BulkAction, body: BulkPayload) => api<BulkResult>("/api/clients/bulk", { method: "POST", json: { action, ...body } })

	const run = async (action: BulkAction, payload: BulkPayload) => {
		setBusy(action)
		let total = emptyResult()
		try {
			if (payload.ids) {
				const slices: string[][] = []
				for (let i = 0; i < payload.ids.length; i += CHUNK) slices.push(payload.ids.slice(i, i + CHUNK))
				let n = 0
				for (const ids of slices) {
					n++
					if (slices.length > 1) setProgress(`${formatNumber(n, locale)}/${formatNumber(slices.length, locale)}`)
					total = mergeResults(total, await post(action, { ids, days: payload.days, gb: payload.gb }))
				}
			} else {
				for (let round = 0; round < ROUNDS; round++) {
					const r = await post(action, { filter: payload.filter, days: payload.days, gb: payload.gb })
					total = mergeResults(total, r)
					setProgress(formatNumber(total.done, locale))
					// nothing left, or nothing worked: stop instead of looping forever
					if (r.requested === 0 || r.done === 0) break
				}
			}
			const parts = [`${L("\u0627\u0646\u062c\u0627\u0645", "Done")}: ${formatNumber(total.done, locale)}`]
			if (total.skipped > 0) parts.push(`${L("\u0631\u062f \u0634\u062f\u0647", "Skipped")}: ${formatNumber(total.skipped, locale)}`)
			if (total.failed > 0) parts.push(`${L("\u0646\u0627\u0645\u0648\u0641\u0642", "Failed")}: ${formatNumber(total.failed, locale)}`)
			if (total.refund !== "0") parts.push(`${L("\u0628\u0627\u0632\u06af\u0634\u062a", "Refund")}: ${formatNumber(Number(total.refund), locale)} ${t("currency_irt")}`)
			const summary = parts.join(" \u00b7 ")
			if (total.failed > 0) toast.err(`${summary} \u2014 ${total.errors[0]?.message ?? ""}`)
			else toast.ok(summary)
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setBusy(null)
			setProgress("")
			onDone()
		}
	}

	return { busy, progress, run, L, locale, t }
}

/** Floating action bar for the selected rows. */
export function ClientBulkBar({ ids, onDone, onClear }: { ids: string[]; onDone: () => void; onClear: () => void }) {
	const { busy, progress, run, L, locale, t } = useBulkRunner(onDone)
	const confirm = useConfirm()
	const [ask, setAsk] = useState<"addDays" | "addGb" | null>(null)
	const [days, setDays] = useState(30)
	const [gb, setGb] = useState(10)
	const disabled = busy !== null

	const apply = async () => {
		const action = ask
		setAsk(null)
		if (action === "addDays") await run("addDays", { ids, days })
		else if (action === "addGb") await run("addGb", { ids, gb })
	}

	const wipe = async () => {
		if (!(await confirm(`${formatNumber(ids.length, locale)} ${L("\u06a9\u0644\u0627\u06cc\u0646\u062a \u062d\u0630\u0641 \u0634\u0648\u062f\u061f", "clients will be deleted?")}`))) return
		await run("delete", { ids })
	}

	return (
		<>
			<div className="sticky bottom-3 z-20 mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur">
				<span className="text-xs text-muted">
					<span className="num">{formatNumber(ids.length, locale)}</span> {L("\u0627\u0646\u062a\u062e\u0627\u0628 \u0634\u062f\u0647", "selected")}
					{progress && <span className="num ms-2">{progress}</span>}
				</span>
				<Button size="sm" disabled={disabled} onClick={() => setAsk("addDays")}><Clock className="h-4 w-4" />{L("\u0627\u0641\u0632\u0648\u062f\u0646 \u0631\u0648\u0632", "Add days")}</Button>
				<Button size="sm" disabled={disabled} onClick={() => setAsk("addGb")}><Layers className="h-4 w-4" />{L("\u0627\u0641\u0632\u0648\u062f\u0646 \u062d\u062c\u0645", "Add traffic")}</Button>
				<Button size="sm" disabled={disabled} loading={busy === "enable"} onClick={() => run("enable", { ids })}><Check className="h-4 w-4" />{t("cl_enable")}</Button>
				<Button size="sm" disabled={disabled} loading={busy === "disable"} onClick={() => run("disable", { ids })}>{t("cl_disable")}</Button>
				<Button size="sm" disabled={disabled} loading={busy === "resetTraffic"} onClick={() => run("resetTraffic", { ids })}><RotateCcw className="h-4 w-4" />{t("cl_reset")}</Button>
				<Button size="sm" disabled={disabled} loading={busy === "repush"} onClick={() => run("repush", { ids })}><RefreshCw className="h-4 w-4" />{L("\u0647\u0645\u06af\u0627\u0645\u200c\u0633\u0627\u0632\u06cc", "Re-sync")}</Button>
				<Button size="sm" variant="danger" disabled={disabled} loading={busy === "delete"} onClick={wipe}><Trash2 className="h-4 w-4" />{t("delete")}</Button>
				<Button size="sm" variant="ghost" disabled={disabled} onClick={onClear}>{L("\u0644\u063a\u0648 \u0627\u0646\u062a\u062e\u0627\u0628", "Clear")}</Button>
			</div>

			<Modal open={ask !== null} onClose={() => setAsk(null)} title={ask === "addGb" ? L("\u0627\u0641\u0632\u0648\u062f\u0646 \u062d\u062c\u0645", "Add traffic") : L("\u0627\u0641\u0632\u0648\u062f\u0646 \u0631\u0648\u0632", "Add days")}>
				<div className="flex flex-col gap-3">
					{ask === "addGb" ? (
						<Field label={L("\u062d\u062c\u0645 (\u06af\u06cc\u06af\u0627\u0628\u0627\u06cc\u062a)", "Traffic (GB)")} hint={L("\u0631\u0648\u06cc \u06a9\u0644\u0627\u06cc\u0646\u062a\u200c\u0647\u0627\u06cc \u0646\u0627\u0645\u062d\u062f\u0648\u062f \u0627\u0639\u0645\u0627\u0644 \u0646\u0645\u06cc\u200c\u0634\u0648\u062f", "Unlimited clients are skipped")}>
							<Input type="number" value={gb} onChange={(e) => setGb(Number(e.target.value))} />
						</Field>
					) : (
						<Field label={L("\u062a\u0639\u062f\u0627\u062f \u0631\u0648\u0632", "Days")} hint={L("\u0627\u0632 \u062a\u0627\u0631\u06cc\u062e \u0627\u0646\u0642\u0636\u0627\u06cc \u0641\u0639\u0644\u06cc \u062d\u0633\u0627\u0628 \u0645\u06cc\u200c\u0634\u0648\u062f", "Counted from the current expiry")}>
							<Input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} />
						</Field>
					)}
					<Button variant="primary" loading={disabled} onClick={apply}>{L("\u062a\u0623\u06cc\u06cc\u062f", "Apply")}</Button>
				</div>
			</Modal>
		</>
	)
}

/** Panel drift + clean-up, driven by the same endpoint with a filter instead of ids. */
export function ClientMaintenance({ overview, onDone }: { overview: ClientOverview | null; onDone: () => void }) {
	const { busy, run, L, locale, t } = useBulkRunner(onDone)
	const confirm = useConfirm()
	if (!overview) return null
	const all: MaintenanceRow[] = [
		{
			key: "broken",
			count: overview.broken,
			label: L("\u06a9\u0627\u0646\u0641\u06cc\u06af \u062e\u0637\u0627\u062f\u0627\u0631", "Failed configs"),
			hint: L("\u0622\u062e\u0631\u06cc\u0646 \u0627\u0631\u0633\u0627\u0644 \u0628\u0647 \u067e\u0646\u0644 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062f\u0647", "The last push to the panel failed"),
			action: "repush",
			filter: { broken: true },
			danger: false,
		},
		{
			key: "orphan",
			count: overview.orphan,
			label: L("\u0628\u062f\u0648\u0646 \u06a9\u0627\u0646\u0641\u06cc\u06af", "No config"),
			hint: L("\u0631\u0648\u06cc \u0647\u06cc\u0686 \u067e\u0646\u0644\u06cc \u0633\u0627\u062e\u062a\u0647 \u0646\u0634\u062f\u0647", "Not present on any panel"),
			action: "delete",
			filter: { orphan: true },
			danger: true,
		},
		{
			key: "stale",
			count: overview.stale,
			label: L("\u0645\u0646\u0642\u0636\u06cc \u0642\u062f\u06cc\u0645\u06cc", "Long expired"),
			hint: `${L("\u0628\u06cc\u0634 \u0627\u0632", "More than")} ${formatNumber(overview.staleDays, locale)} ${t("days")}`,
			action: "delete",
			filter: { expiredBeforeDays: overview.staleDays },
			danger: true,
		},
	]
	const rows = all.filter((r) => r.count > 0)

	return (
		<Card className="mt-4" title={L("\u0646\u06af\u0647\u062f\u0627\u0634\u062a", "Maintenance")} subtitle={L("\u067e\u0627\u06a9\u200c\u0633\u0627\u0632\u06cc \u0648 \u0631\u0641\u0639 \u0646\u0627\u0633\u0627\u0632\u06af\u0627\u0631\u06cc \u0628\u0627 \u067e\u0646\u0644", "Clean-up and panel drift repair")}>
			{rows.length === 0 ? (
				<p className="text-xs text-muted">{L("\u0647\u0645\u0647\u200c\u0686\u06cc\u0632 \u0645\u0631\u062a\u0628 \u0627\u0633\u062a", "Everything is in order")}</p>
			) : (
				<div className="flex flex-col gap-2">
					{rows.map((r) => (
						<div key={r.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 px-3 py-2">
							<div className="text-xs">
								<div className="flex items-center gap-1.5 font-medium">
									<AlertTriangle className="h-4 w-4 text-warning" />
									{r.label}
									<span className="num">({formatNumber(r.count, locale)})</span>
								</div>
								<div className="text-muted">{r.hint}</div>
							</div>
							<Button
								size="sm"
								variant={r.danger ? "danger" : "ghost"}
								disabled={busy !== null}
								loading={busy === r.action}
								onClick={async () => {
									if (r.danger && !(await confirm(`${r.label} (${formatNumber(r.count, locale)}) \u2014 ${t("confirm_delete")}`))) return
									await run(r.action, { filter: r.filter })
								}}
							>
								{r.danger ? t("delete") : L("\u0647\u0645\u06af\u0627\u0645\u200c\u0633\u0627\u0632\u06cc", "Re-sync")}
							</Button>
						</div>
					))}
				</div>
			)}
		</Card>
	)
}
