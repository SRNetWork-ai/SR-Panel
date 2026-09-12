"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BellRing, CheckCircle2, Download, Percent, RefreshCw, XCircle } from "lucide-react"
import { api } from "@/lib/client"
import { formatDate, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Input, Select, Spinner, cx, useToast } from "@/components/ui"
import { MiniStat } from "@/components/bits"
import { csvOf, downloadText, errMsg, tr, type NotificationRow } from "./types"

type Filter = "all" | "ok" | "failed"

export function NotificationsTab() {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const L = (fa: string, en: string) => tr(locale, fa, en)

	const [rows, setRows] = useState<NotificationRow[] | null>(null)
	const [filter, setFilter] = useState<Filter>("all")
	const [channel, setChannel] = useState("")
	const [q, setQ] = useState("")
	const [busy, setBusy] = useState(false)

	const load = useCallback(async () => setRows((await api<{ items: NotificationRow[] }>("/api/notifications")).items), [])
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

	const channels = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.channel))).sort(), [rows])

	const stats = useMemo(() => {
		const all = rows ?? []
		const ok = all.filter((r) => r.ok).length
		return { total: all.length, ok, failed: all.length - ok, rate: all.length ? Math.round((ok / all.length) * 100) : 0 }
	}, [rows])

	const shown = useMemo(() => {
		const needle = q.trim().toLowerCase()
		return (rows ?? []).filter((r) => {
			if (filter === "ok" && !r.ok) return false
			if (filter === "failed" && r.ok) return false
			if (channel && r.channel !== channel) return false
			if (!needle) return true
			return [r.kind, r.channel, r.targetId, r.adminId, r.error].some((v) => String(v ?? "").toLowerCase().includes(needle))
		})
	}, [rows, filter, channel, q])

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MiniStat icon={<BellRing className="h-4 w-4" />} label={L("کل ارسال‌ها (۱۰۰ مورد اخیر)", "Deliveries (last 100)")} value={stats.total} tone="violet" />
				<MiniStat icon={<CheckCircle2 className="h-4 w-4" />} label={L("موفق", "Succeeded")} value={stats.ok} tone="success" />
				<MiniStat icon={<XCircle className="h-4 w-4" />} label={L("ناموفق", "Failed")} value={stats.failed} tone="danger" />
				<MiniStat icon={<Percent className="h-4 w-4" />} label={L("نرخ موفقیت", "Success rate")} value={`${stats.rate}%`} tone="cyan" />
			</div>

			<Card
				title={t("ntf_title")}
				subtitle={t("ntf_sub")}
				bodyClassName="px-0 pb-0"
				actions={
					<div className="flex flex-wrap gap-2">
						<Button size="sm" onClick={refresh} loading={busy} title={t("refresh")}>
							<RefreshCw className="h-4 w-4" />
						</Button>
						<Button size="sm" onClick={() => downloadText(`notifications-${new Date().toISOString().slice(0, 10)}.csv`, csvOf(shown))} disabled={shown.length === 0}>
							<Download className="h-4 w-4" /> CSV
						</Button>
					</div>
				}
			>
				<div className="flex flex-wrap items-center gap-2 px-5 pb-4">
					<Input className="w-56" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
					<div className="flex flex-wrap gap-1">
						{(["all", "ok", "failed"] as Filter[]).map((f) => (
							<button key={f} type="button" onClick={() => setFilter(f)} className={cx("chip", filter === f && "chip-on")}>
								{f === "all" ? t("all") : f === "ok" ? L("موفق", "Succeeded") : L("ناموفق", "Failed")}
							</button>
						))}
					</div>
					{channels.length > 1 && (
						<Select className="w-40" value={channel} onChange={(e) => setChannel(e.target.value)}>
							<option value="">{L("همهٔ کانال‌ها", "All channels")}</option>
							{channels.map((c) => (
								<option key={c} value={c}>{c}</option>
							))}
						</Select>
					)}
					<span className="ms-auto text-xs text-muted">{shown.length} / {stats.total}</span>
				</div>

				{rows === null ? (
					<div className="flex justify-center p-8"><Spinner /></div>
				) : shown.length === 0 ? (
					<div className="px-5 pb-5"><Empty text={rows.length === 0 ? t("ntf_empty") : t("nothing_here")} /></div>
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr>
									<th>{t("ntf_time")}</th>
									<th>{L("کانال", "Channel")}</th>
									<th>{t("ntf_kind")}</th>
									<th>{t("ntf_target")}</th>
									<th>{t("ntf_result")}</th>
								</tr>
							</thead>
							<tbody>
								{shown.map((n) => (
									<tr key={String(n.id)}>
										<td className="whitespace-nowrap">
											<div className="num">{formatDate(n.at, locale, true)}</div>
											<div className="text-xs text-muted">{relativeTime(n.at, locale)}</div>
										</td>
										<td><Badge tone="cyan">{n.channel}</Badge></td>
										<td><Badge tone="violet">{n.kind}</Badge></td>
										<td className="mono max-w-[220px] truncate text-xs text-muted" title={n.targetId ?? ""}>{n.targetId ?? "—"}</td>
										<td>
											{n.ok ? (
												<Badge tone="success">OK</Badge>
											) : (
												<span className={cx("block max-w-[280px] truncate text-xs text-danger")} title={n.error ?? ""}>{n.error ?? "FAILED"}</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>
		</div>
	)
}
