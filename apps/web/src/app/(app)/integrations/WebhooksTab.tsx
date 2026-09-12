"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, AlertTriangle, KeyRound, Pencil, Plus, RefreshCw, Trash2, Webhook as WebhookIcon, Zap } from "lucide-react"
import { api } from "@/lib/client"
import { formatDate, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Input, Modal, Spinner, Switch, cx, useConfirm, useToast } from "@/components/ui"
import { CopyBtn, MiniStat } from "@/components/bits"
import { WebhookModal } from "./WebhookModal"
import { errMsg, tr, whState, type WebhookRow } from "./types"

type Filter = "all" | "active" | "inactive" | "failing"

export function WebhooksTab() {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const L = (fa: string, en: string) => tr(locale, fa, en)

	const [rows, setRows] = useState<WebhookRow[] | null>(null)
	const [events, setEvents] = useState<string[]>([])
	const [filter, setFilter] = useState<Filter>("all")
	const [editing, setEditing] = useState<Partial<WebhookRow> | null>(null)
	const [secretFor, setSecretFor] = useState<WebhookRow | null>(null)
	const [testingId, setTestingId] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	const load = useCallback(async () => {
		const r = await api<{ items: WebhookRow[]; events: string[] }>("/api/webhooks")
		setRows(r.items)
		setEvents(r.events)
	}, [])
	useEffect(() => {
		load().catch(() => setRows([]))
	}, [load])

	async function refresh() {
		setBusy(true)
		try {
			await load()
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setBusy(false)
		}
	}

	async function toggleActive(w: WebhookRow, v: boolean) {
		setRows((cur) => (cur ?? []).map((x) => (x.id === w.id ? { ...x, isActive: v } : x)))
		try {
			await api(`/api/webhooks/${w.id}`, { method: "PATCH", json: { url: w.url, events: w.events, isActive: v } })
			await load()
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
			await load()
		}
	}

	async function remove(w: WebhookRow) {
		if (!confirm(t("confirm_delete"))) return
		try {
			await api(`/api/webhooks/${w.id}`, { method: "DELETE" })
			await load()
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		}
	}

	async function test(w: WebhookRow) {
		setTestingId(w.id)
		try {
			const r = await api<{ status: number | null; error: string | null }>(`/api/webhooks/${w.id}/test`, { method: "POST" })
			if (r.status && r.status < 300) toast.ok(`${t("wh_test_ok")} (${r.status})`)
			else toast.err(`${t("wh_test_fail")}: ${r.error ?? r.status ?? ""}`)
			await load()
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setTestingId(null)
		}
	}

	const stats = useMemo(() => {
		const all = rows ?? []
		return {
			total: all.length,
			active: all.filter((w) => w.isActive).length,
			failing: all.filter((w) => whState(w) === "fail").length,
			idle: all.filter((w) => whState(w) === "idle").length,
		}
	}, [rows])

	const shown = useMemo(
		() =>
			(rows ?? []).filter((w) => {
				if (filter === "active") return w.isActive
				if (filter === "inactive") return !w.isActive
				if (filter === "failing") return whState(w) === "fail"
				return true
			}),
		[rows, filter],
	)

	function stateBadge(w: WebhookRow) {
		const st = whState(w)
		if (st === "off") return <Badge tone="muted">{t("inactive")}</Badge>
		if (st === "fail") return <Badge tone="danger">{L("خطا", "Failing")}</Badge>
		if (st === "idle") return <Badge tone="cyan">{L("بدون ارسال", "No delivery yet")}</Badge>
		return <Badge tone="success">{L("سالم", "Healthy")}</Badge>
	}

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MiniStat icon={<WebhookIcon className="h-4 w-4" />} label={L("کل وب‌هوک‌ها", "Total webhooks")} value={stats.total} tone="violet" />
				<MiniStat icon={<Zap className="h-4 w-4" />} label={t("active")} value={stats.active} tone="success" />
				<MiniStat icon={<AlertTriangle className="h-4 w-4" />} label={L("دارای خطا", "Failing")} value={stats.failing} tone="danger" />
				<MiniStat icon={<Activity className="h-4 w-4" />} label={L("بدون ارسال", "Never fired")} value={stats.idle} tone="cyan" />
			</div>

			<Card
				title={t("wh_title")}
				subtitle={t("wh_sub")}
				actions={
					<div className="flex flex-wrap gap-2">
						<Button size="sm" onClick={refresh} loading={busy} title={t("refresh")}>
							<RefreshCw className="h-4 w-4" />
						</Button>
						<Button size="sm" variant="primary" onClick={() => setEditing({ url: "", events: [], isActive: true })}>
							<Plus className="h-4 w-4" /> {t("wh_create")}
						</Button>
					</div>
				}
			>
				<div className="mb-4 flex flex-wrap gap-1">
					{(["all", "active", "inactive", "failing"] as Filter[]).map((f) => (
						<button key={f} type="button" onClick={() => setFilter(f)} className={cx("chip", filter === f && "chip-on")}>
							{f === "all" ? t("all") : f === "active" ? t("active") : f === "inactive" ? t("inactive") : L("دارای خطا", "Failing")}
						</button>
					))}
				</div>

				{rows === null ? (
					<div className="flex justify-center p-8"><Spinner /></div>
				) : shown.length === 0 ? (
					<Empty text={rows.length === 0 ? t("wh_empty") : t("nothing_here")} />
				) : (
					<div className="space-y-3">
						{shown.map((w) => (
							<div key={w.id} className="tile space-y-3 p-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0 flex-1 space-y-2">
										<div className="flex flex-wrap items-center gap-2">
											{stateBadge(w)}
											<span className="mono max-w-[420px] truncate text-xs" dir="ltr" title={w.url}>{w.url}</span>
											<CopyBtn value={w.url} />
										</div>
										<div className="flex flex-wrap gap-1">
											{w.events.length === 0 ? (
												<Badge tone="violet">{t("wh_all_events")}</Badge>
											) : (
												<>
													{w.events.slice(0, 5).map((ev) => (
														<span key={ev} className="chip mono text-[11px]" dir="ltr">{ev}</span>
													))}
													{w.events.length > 5 && <span className="chip">+{w.events.length - 5}</span>}
												</>
											)}
										</div>
									</div>
									<div className="flex flex-wrap items-center gap-1">
										<Switch checked={w.isActive} onChange={(v) => toggleActive(w, v)} label={t("wh_active")} />
										<Button size="icon" variant="ghost" onClick={() => test(w)} loading={testingId === w.id} title={t("wh_test")}>
											<Zap className="h-4 w-4" />
										</Button>
										<Button size="icon" variant="ghost" onClick={() => setSecretFor(w)} title={t("wh_secret")}>
											<KeyRound className="h-4 w-4" />
										</Button>
										<Button size="icon" variant="ghost" onClick={() => setEditing(w)} title={t("edit")}>
											<Pencil className="h-4 w-4" />
										</Button>
										<Button size="icon" variant="ghost" onClick={() => remove(w)} title={t("delete")}>
											<Trash2 className="h-4 w-4 text-danger" />
										</Button>
									</div>
								</div>
								<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
									<span className="flex items-center gap-1">
										{t("wh_last_status")}:
										{w.lastStatus === null ? <span>—</span> : <Badge tone={w.lastStatus < 300 ? "success" : "danger"}>{w.lastStatus}</Badge>}
									</span>
									{w.lastFiredAt && <span>{relativeTime(w.lastFiredAt, locale)}</span>}
									{w.failCount > 0 && <span className="text-danger">{L("خطای متوالی", "Consecutive failures")}: {w.failCount}</span>}
									{w.lastError && <span className="max-w-[320px] truncate text-danger" title={w.lastError}>{w.lastError}</span>}
									<span className="num">{t("created_at")}: {formatDate(w.createdAt, locale)}</span>
								</div>
							</div>
						))}
					</div>
				)}

				<div className="mt-5 border-t border-white/5 pt-4 text-xs leading-6 text-muted">
					<div className="mb-1 font-medium text-fg">{t("wh_signature_hint")}</div>
					<code className="mono" dir="ltr">x-srp-event, x-srp-delivery, x-srp-signature: sha256=HMAC_SHA256(secret, rawBody)</code>
				</div>
			</Card>

			{editing && (
				<WebhookModal
					value={editing}
					events={events}
					onClose={() => setEditing(null)}
					onSaved={(created) => {
						setEditing(null)
						if (created) setSecretFor(created)
						void load()
					}}
				/>
			)}

			<Modal
				open={secretFor !== null}
				onClose={() => setSecretFor(null)}
				title={t("wh_secret")}
				footer={<Button variant="primary" onClick={() => setSecretFor(null)}>{t("close")}</Button>}
			>
				<p className="mb-3 text-sm text-muted">{t("wh_secret_hint")}</p>
				<div className="flex items-center gap-2">
					<Input readOnly dir="ltr" className="mono flex-1" value={secretFor?.secret ?? ""} onFocus={(e) => e.currentTarget.select()} />
					<CopyBtn value={secretFor?.secret ?? ""} />
				</div>
			</Modal>
		</div>
	)
}
