"use client"

import { useCallback, useEffect, useState } from "react"
import { Activity, AlertTriangle, CheckCircle2, Cpu, RefreshCw, Server as ServerIcon, Timer } from "lucide-react"
import type { MonitoringOverview } from "@srpanel/core"
import { api } from "@/lib/client"
import { formatDate, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import type { DictKey } from "@/lib/dict"
import { Badge, Button, Card, Empty, PageHeader, Progress, Stat, StatusBadge, Switch, useConfirm, useToast } from "@/components/ui"
import { MiniBars } from "@/components/Charts"

type Incident = MonitoringOverview["incidents"][number]
type Filter = "ALL" | "OPEN" | "RESOLVED"

const KIND_KEY: Record<string, DictKey> = { OFFLINE: "inc_OFFLINE", AUTH_ERROR: "inc_AUTH_ERROR", XRAY_DOWN: "inc_XRAY_DOWN", HIGH_CPU: "inc_HIGH_CPU" }
const KIND_TONE: Record<string, "danger" | "warning" | "violet" | "cyan"> = { OFFLINE: "danger", AUTH_ERROR: "warning", XRAY_DOWN: "violet", HIGH_CPU: "warning" }

function uptimeTone(v: number | null): "success" | "warning" | "danger" | "muted" {
	if (v === null) return "muted"
	if (v >= 99) return "success"
	if (v >= 95) return "warning"
	return "danger"
}

function duration(startIso: string, endIso: string | null, locale: "fa" | "en"): string {
	const ms = (endIso ? new Date(endIso).getTime() : Date.now()) - new Date(startIso).getTime()
	const m = Math.max(1, Math.round(ms / 60_000))
	if (m < 60) return locale === "fa" ? `${m} دقیقه` : `${m}m`
	const h = Math.floor(m / 60)
	if (h < 48) return locale === "fa" ? `${h} ساعت` : `${h}h ${m % 60}m`
	return locale === "fa" ? `${Math.floor(h / 24)} روز` : `${Math.floor(h / 24)}d`
}

export function MonitoringClient({ initial }: { initial: MonitoringOverview }) {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const [data, setData] = useState<MonitoringOverview>(initial)
	const [filter, setFilter] = useState<Filter>("ALL")
	const [auto, setAuto] = useState(true)
	const [loading, setLoading] = useState(false)

	const refresh = useCallback(async () => {
		setLoading(true)
		try {
			setData(await api<MonitoringOverview>("/api/monitoring"))
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setLoading(false)
		}
	}, [t, toast])

	useEffect(() => {
		if (!auto) return
		const h = setInterval(refresh, 30_000)
		return () => clearInterval(h)
	}, [auto, refresh])

	async function resolve(inc: Incident) {
		if (!confirm(t("mon_resolve_confirm"))) return
		try {
			await api(`/api/incidents/${inc.id}/resolve`, { method: "POST" })
			toast.ok(t("mon_resolved"))
			await refresh()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		}
	}

	const incidents = data.incidents.filter((i) => filter === "ALL" || i.status === filter)
	const { summary } = data

	return (
		<div className="space-y-6 fade-up">
			<PageHeader
				title={t("mon_title")}
				subtitle={t("mon_sub")}
				actions={
					<div className="flex items-center gap-3">
						<Switch checked={auto} onChange={setAuto} label={t("mon_auto_refresh")} />
						<Button onClick={refresh} loading={loading} size="sm">
							<RefreshCw className="h-4 w-4" /> {t("refresh")}
						</Button>
					</div>
				}
			/>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<Stat label={t("mon_servers_online")} value={`${summary.online} / ${summary.servers}`} icon={<ServerIcon className="h-5 w-5" />} accent={summary.online === summary.servers ? "success" : "warning"} />
				<Stat label={t("mon_uptime_24h")} value={summary.uptime24 === null ? "—" : `${summary.uptime24}%`} icon={<Activity className="h-5 w-5" />} accent={uptimeTone(summary.uptime24) === "success" ? "cyan" : "warning"} />
				<Stat label={t("mon_uptime_7d")} value={summary.uptime7d === null ? "—" : `${summary.uptime7d}%`} icon={<Timer className="h-5 w-5" />} accent="violet" />
				<Stat label={t("mon_open_incidents")} value={summary.openIncidents} icon={summary.openIncidents ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />} accent={summary.openIncidents ? "danger" : "success"} />
			</div>

			{data.servers.length === 0 ? (
				<Card>
					<Empty text={t("mon_no_servers")} />
				</Card>
			) : (
				<div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
					{data.servers.map((s) => (
						<Card
							key={s.id}
							title={s.name}
							subtitle={s.lastSeenAt ? `${t("last_seen")}: ${relativeTime(s.lastSeenAt, locale)}` : undefined}
							actions={
								<div className="flex items-center gap-2">
									{s.openIncidents > 0 && <Badge tone="danger">{s.openIncidents} {t("mon_incident_short")}</Badge>}
									<StatusBadge status={s.status} />
								</div>
							}
						>
							<div className="grid grid-cols-2 gap-4 text-sm">
								<div>
									<div className="mb-1 flex items-center justify-between text-xs text-muted">
										<span>{t("mon_uptime_24h")}</span>
										<Badge tone={uptimeTone(s.uptime24)}>{s.uptime24 === null ? "—" : `${s.uptime24}%`}</Badge>
									</div>
									<Progress value={s.uptime24 ?? 0} />
								</div>
								<div>
									<div className="mb-1 flex items-center justify-between text-xs text-muted">
										<span>{t("mon_uptime_7d")}</span>
										<Badge tone={uptimeTone(s.uptime7d)}>{s.uptime7d === null ? "—" : `${s.uptime7d}%`}</Badge>
									</div>
									<Progress value={s.uptime7d ?? 0} />
								</div>
							</div>

							<div className="mt-4">
								<div className="mb-1 flex items-center justify-between text-xs text-muted">
									<span>{t("mon_latency_24h")}</span>
									<span className="num">{s.latencyMs === null ? "—" : `${s.latencyMs} ms`}</span>
								</div>
								{s.latency.length ? <MiniBars data={s.latency} height={48} /> : <div className="text-xs text-muted">{t("mon_no_data")}</div>}
							</div>

							<div className="mt-4 grid grid-cols-3 gap-3 text-xs">
								<div className="glass-2 rounded-xl p-2.5">
									<div className="flex items-center gap-1 text-muted"><Cpu className="h-3.5 w-3.5" /> CPU</div>
									<div className="num mt-1 text-base font-semibold">{s.cpu === null ? "—" : `${Math.round(s.cpu)}%`}</div>
								</div>
								<div className="glass-2 rounded-xl p-2.5">
									<div className="text-muted">RAM</div>
									<div className="num mt-1 text-base font-semibold">{s.memPct === null ? "—" : `${s.memPct}%`}</div>
								</div>
								<div className="glass-2 rounded-xl p-2.5">
									<div className="text-muted">Xray</div>
									<div className="mt-1 text-base font-semibold">{s.xrayState ?? "—"}</div>
								</div>
							</div>
							{s.lastError && s.status !== "ONLINE" && <div className="mono mt-3 truncate text-xs text-danger" title={s.lastError}>{s.lastError}</div>}
						</Card>
					))}
				</div>
			)}

			<Card
				title={t("mon_incidents")}
				subtitle={t("mon_incidents_sub")}
				bodyClassName="px-0 pb-0"
				actions={
					<div className="flex gap-1">
						{(["ALL", "OPEN", "RESOLVED"] as Filter[]).map((f) => (
							<Button key={f} size="sm" variant={filter === f ? "primary" : "ghost"} onClick={() => setFilter(f)}>
								{t(f === "ALL" ? "mon_filter_all" : f === "OPEN" ? "mon_filter_open" : "mon_filter_resolved")}
							</Button>
						))}
					</div>
				}
			>
				{incidents.length === 0 ? (
					<div className="px-5 pb-5">
						<Empty text={t("mon_no_incidents")} />
					</div>
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr>
									<th>{t("mon_col_server")}</th>
									<th>{t("mon_col_kind")}</th>
									<th>{t("mon_col_status")}</th>
									<th>{t("mon_col_started")}</th>
									<th>{t("mon_col_duration")}</th>
									<th>{t("mon_col_message")}</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{incidents.map((i) => (
									<tr key={i.id}>
										<td className="font-medium">{i.serverName}</td>
										<td><Badge tone={KIND_TONE[i.kind] ?? "violet"}>{t(KIND_KEY[i.kind] ?? "inc_OFFLINE")}</Badge></td>
										<td><Badge tone={i.status === "OPEN" ? "danger" : "success"}>{t(i.status === "OPEN" ? "mon_filter_open" : "mon_filter_resolved")}</Badge></td>
										<td className="num whitespace-nowrap">{formatDate(i.startedAt, locale, true)}</td>
										<td className="num whitespace-nowrap">{duration(i.startedAt, i.resolvedAt, locale)}</td>
										<td className="mono max-w-[260px] truncate text-xs text-muted" title={i.message ?? ""}>{i.message ?? "—"}</td>
										<td className="text-end">
											{i.status === "OPEN" && (
												<Button size="sm" variant="ghost" onClick={() => resolve(i)}>
													{t("mon_resolve")}
												</Button>
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
