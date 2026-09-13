"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Activity, AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Cpu, Gauge, HardDrive, Layers, RefreshCw, Timer, Users } from "lucide-react"
import type { ServerDetail } from "@srpanel/core"
import { ApiError, api } from "@/lib/client"
import type { DictKey } from "@/lib/dict"
import { formatBytes, formatNumber, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, PageHeader, Progress, StatusBadge, cx, useToast } from "@/components/ui"
import { CopyBtn, MiniStat } from "@/components/bits"
import { MiniBars } from "@/components/Charts"
import { tr } from "../types"

const HOURS = [6, 24, 72, 168]

const KIND_KEY: Record<string, DictKey> = { OFFLINE: "inc_OFFLINE", AUTH_ERROR: "inc_AUTH_ERROR", XRAY_DOWN: "inc_XRAY_DOWN", HIGH_CPU: "inc_HIGH_CPU" }
const KIND_TONE: Record<string, "danger" | "warning" | "violet"> = { OFFLINE: "danger", AUTH_ERROR: "warning", XRAY_DOWN: "violet", HIGH_CPU: "warning" }

function uptimeTone(v: number | null): "success" | "warning" | "danger" | "muted" {
	if (v === null) return "muted"
	if (v >= 99) return "success"
	if (v >= 95) return "warning"
	return "danger"
}

/** An open incident is still running, so "now" closes its duration. */
function duration(startIso: string, endIso: string | null, locale: "fa" | "en"): string {
	const ms = (endIso ? new Date(endIso).getTime() : Date.now()) - new Date(startIso).getTime()
	const m = Math.max(1, Math.round(ms / 60_000))
	if (m < 60) return locale === "fa" ? `${m} دقیقه` : `${m}m`
	const h = Math.floor(m / 60)
	if (h < 48) return locale === "fa" ? `${h} ساعت` : `${h}h`
	return locale === "fa" ? `${Math.floor(h / 24)} روز` : `${Math.floor(h / 24)}d`
}

function Meter({ icon, label, pct, text }: { icon: ReactNode; label: string; pct: number | null; text: string }) {
	return (
		<div>
			<div className="mb-1 flex items-center justify-between text-[11px] text-muted">
				<span className="flex items-center gap-1">{icon}{label}</span>
				<span className="num">{pct === null ? text : `${pct}% • ${text}`}</span>
			</div>
			<Progress value={pct ?? 0} />
		</div>
	)
}

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div className="tile p-2">
			<div className="text-muted">{label}</div>
			<div className="num mt-0.5 truncate font-semibold" title={value}>{value}</div>
		</div>
	)
}

export function ServerDetailClient({ initial }: { initial: ServerDetail }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const router = useRouter()
	const [data, setData] = useState<ServerDetail>(initial)
	const [hours, setHours] = useState<number>(initial.hours)
	const [loading, setLoading] = useState(false)
	const [syncing, setSyncing] = useState(false)

	async function load(h: number) {
		setLoading(true)
		try {
			const next = await api<ServerDetail>(`/api/servers/${data.id}/detail?hours=${h}`)
			setData(next)
			setHours(next.hours)
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setLoading(false)
		}
	}

	async function sync() {
		setSyncing(true)
		try {
			const r = await api<{ ok: boolean; inbounds?: number; error?: string }>(`/api/servers/${data.id}/sync`, { method: "POST" })
			if (r.ok) toast.ok(t("srv_test_ok", { n: r.inbounds ?? 0 }))
			else toast.err(r.error || t("error_generic"))
			await load(hours)
			router.refresh()
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setSyncing(false)
		}
	}

	const live = data.live
	const latency = data.health.latencyLast ?? data.health.latencyAvg24
	const uptimeText = (v: number | null) => (v === null ? "—" : `${formatNumber(v, locale)}%`)
	const hourLabel = (h: number) => (h >= 168 ? L("۷ روز", "7 days") : L(`${h} ساعت`, `${h}h`))
	const bootTime = (sec: number | null) => {
		if (sec === null || sec <= 0) return "—"
		const d = Math.floor(sec / 86_400)
		const h = Math.floor((sec % 86_400) / 3_600)
		return d > 0 ? L(`${d} روز و ${h} ساعت`, `${d}d ${h}h`) : L(`${h} ساعت`, `${h}h`)
	}

	return (
		<div className="space-y-5 fade-up">
			<PageHeader
				title={data.name}
				subtitle={data.baseUrl}
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<div className="flex flex-wrap gap-1.5">
							{HOURS.map((h) => (
								<button type="button" key={h} onClick={() => load(h)} className={cx("chip", hours === h && "chip-on")}>{hourLabel(h)}</button>
							))}
						</div>
						<Button type="button" size="sm" variant="ghost" onClick={() => load(hours)} loading={loading} title={t("refresh")}>
							{!loading && <RefreshCw className="h-4 w-4" />}
						</Button>
						<Button type="button" size="sm" variant="primary" onClick={sync} loading={syncing}>{t("srv_sync")}</Button>
						<Link href="/servers" className="btn btn-sm btn-ghost"><ArrowLeft className="h-4 w-4" /> {L("سرورها", "Servers")}</Link>
					</div>
				}
			/>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
				<MiniStat icon={<Gauge className="h-4 w-4" />} label={L("وضعیت", "Status")} value={<StatusBadge status={data.status} />} tone={data.status === "ONLINE" ? "success" : "danger"} />
				<MiniStat icon={<Activity className="h-4 w-4" />} label={L("آپ‌تایم ۲۴ ساعت", "Uptime 24h")} value={uptimeText(data.health.uptime24)} tone={uptimeTone(data.health.uptime24) === "success" ? "success" : "warning"} />
				<MiniStat icon={<Timer className="h-4 w-4" />} label={L("تأخیر", "Latency")} value={latency === null ? "—" : `${formatNumber(latency, locale)} ms`} tone="cyan" />
				<MiniStat icon={<Users className="h-4 w-4" />} label={t("nav_clients")} value={`${formatNumber(data.totals.activeClients, locale)} / ${formatNumber(data.totals.clients, locale)}`} tone="violet" />
				<MiniStat icon={<Layers className="h-4 w-4" />} label={t("srv_inbounds")} value={`${formatNumber(data.totals.enabledInbounds, locale)} / ${formatNumber(data.totals.inbounds, locale)}`} tone="violet" />
				<MiniStat icon={<ArrowUp className="h-4 w-4" />} label={L("ترافیک کلاینت‌ها", "Client traffic")} value={formatBytes(data.totals.up + data.totals.down)} tone="cyan" />
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<Card
					title={L("وضعیت لحظه‌ای", "Live status")}
					subtitle={data.lastSeenAt ? `${t("last_seen")}: ${relativeTime(data.lastSeenAt, locale)}` : undefined}
					actions={data.isActive ? <Badge tone="cyan">{t("active")}</Badge> : <Badge>{t("inactive")}</Badge>}
				>
					{live ? (
						<div className="space-y-3">
							<Meter icon={<Cpu className="h-3.5 w-3.5" />} label={t("cpu")} pct={live.cpu === null ? null : Math.round(live.cpu)} text={live.cpu === null ? "—" : "CPU"} />
							<Meter icon={<HardDrive className="h-3.5 w-3.5" />} label={t("memory")} pct={live.memPct} text={`${formatBytes(live.memUsed)} / ${formatBytes(live.memTotal)}`} />
							<Meter icon={<HardDrive className="h-3.5 w-3.5" />} label={L("دیسک", "Disk")} pct={live.diskPct} text={`${formatBytes(live.diskUsed)} / ${formatBytes(live.diskTotal)}`} />
							<div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
								<Fact label="Xray" value={live.xrayState ?? "—"} />
								<Fact label={L("نسخه Xray", "Xray version")} value={live.xrayVersion ?? "—"} />
								<Fact label={L("نسخه پنل", "Panel version")} value={live.panelVersion ?? "—"} />
								<Fact label={L("روشن از", "Uptime")} value={bootTime(live.uptime)} />
								<Fact label={L("آی‌پی عمومی", "Public IP")} value={live.publicIp ?? "—"} />
								<Fact label="TCP / UDP" value={`${live.tcpCount ?? 0} / ${live.udpCount ?? 0}`} />
							</div>
							<div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
								<span className="inline-flex items-center gap-1"><ArrowUp className="h-3 w-3 text-cyan" />{formatBytes(live.netUp, 0)}/s</span>
								<span className="inline-flex items-center gap-1"><ArrowDown className="h-3 w-3 text-violet-soft" />{formatBytes(live.netDown, 0)}/s</span>
								<span>{L("کل ارسال", "Sent")}: <span className="num">{formatBytes(live.totalSent)}</span></span>
								<span>{L("کل دریافت", "Received")}: <span className="num">{formatBytes(live.totalRecv)}</span></span>
								{data.publicHost && <span className="mono truncate">{data.publicHost}</span>}
							</div>
						</div>
					) : (
						<Empty text={L("هنوز وضعیتی از این پنل خوانده نشده است", "No status has been read from this panel yet")} />
					)}
				</Card>

				<Card title={L("سلامت و آپ‌تایم", "Health & uptime")} subtitle={L(`بازه ${data.hours} ساعت گذشته`, `Last ${data.hours}h`)}>
					<div className="grid grid-cols-2 gap-3">
						<div>
							<div className="mb-1 flex items-center justify-between text-xs text-muted">
								<span>{L("آپ‌تایم ۲۴ ساعت", "Uptime 24h")}</span>
								<Badge tone={uptimeTone(data.health.uptime24)}>{uptimeText(data.health.uptime24)}</Badge>
							</div>
							<Progress value={data.health.uptime24 ?? 0} />
						</div>
						<div>
							<div className="mb-1 flex items-center justify-between text-xs text-muted">
								<span>{L("آپ‌تایم ۷ روز", "Uptime 7d")}</span>
								<Badge tone={uptimeTone(data.health.uptime7d)}>{uptimeText(data.health.uptime7d)}</Badge>
							</div>
							<Progress value={data.health.uptime7d ?? 0} />
						</div>
					</div>

					<div className="mt-4">
						<div className="mb-1 flex items-center justify-between text-xs text-muted">
							<span>{L("تأخیر پاسخ پنل", "Panel latency")}</span>
							<span className="num">{data.health.latencyAvg24 === null ? "—" : `${data.health.latencyAvg24} ms`}</span>
						</div>
						{data.metrics.length ? (
							<MiniBars data={data.metrics.map((m) => ({ at: m.at, value: m.online ? m.latencyMs : null }))} height={56} />
						) : (
							<div className="text-xs text-muted">{L("داده‌ای ثبت نشده است", "No data recorded yet")}</div>
						)}
					</div>

					{data.metrics.length > 0 && (
						<div className="mt-3">
							<div className="mb-1 text-xs text-muted">{L("در دسترس بودن در این بازه", "Availability in this window")}</div>
							<div className="flex gap-px" dir="ltr">
								{data.metrics.map((m) => (
									<span key={m.at} title={relativeTime(m.at, locale)} className={cx("h-4 flex-1 rounded-sm", m.online ? "bg-success/70" : "bg-danger/70")} />
								))}
							</div>
						</div>
					)}

					<div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
						<Fact label={L("بررسی‌ها (۲۴س)", "Checks (24h)")} value={formatNumber(data.health.checks24, locale)} />
						<Fact label={L("ناموفق (۲۴س)", "Failed (24h)")} value={formatNumber(data.health.fails24, locale)} />
						<Fact label={L("رخداد باز", "Open incidents")} value={formatNumber(data.health.openIncidents, locale)} />
					</div>

					{data.lastError && (
						<div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger">
							{t("last_error")}: {data.lastError}
						</div>
					)}
				</Card>
			</div>

			<Card
				title={t("srv_inbounds")}
				subtitle={L("ترافیک و کلاینت‌های هر اینباند", "Traffic and clients per inbound")}
				bodyClassName="px-0 pb-0"
				actions={data.inboundsSyncAt ? <span className="text-[11px] text-muted">{L("آخرین همگام‌سازی", "Last sync")}: {relativeTime(data.inboundsSyncAt, locale)}</span> : undefined}
			>
				{data.inbounds.length === 0 ? (
					<div className="px-5 pb-5"><Empty text={L("اینباندی خوانده نشده است", "No inbounds were read")} /></div>
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr>
									<th>{L("اینباند", "Inbound")}</th>
									<th>{L("پروتکل", "Protocol")}</th>
									<th>{L("آدرس اتصال", "Connect address")}</th>
									<th>{t("nav_clients")}</th>
									<th>{L("ترافیک پنل", "Panel traffic")}</th>
									<th>{L("ترافیک ثبت‌شده", "Tracked traffic")}</th>
									<th>{L("وضعیت", "Status")}</th>
								</tr>
							</thead>
							<tbody>
								{data.inbounds.map((ib) => (
									<tr key={ib.id}>
										<td>
											<div className="font-medium">{ib.remark || ib.tag || `#${ib.id}`}</div>
											<div className="mono text-[11px] text-muted">{ib.tag}</div>
										</td>
										<td className="whitespace-nowrap">
											<Badge tone="violet">{ib.protocol}</Badge>
											<span className="num ms-1">{ib.port}</span>
											<div className="text-[11px] text-muted">{ib.network} • {ib.security}</div>
										</td>
										<td>
											<div className="flex items-center gap-1">
												<span className="mono max-w-[160px] truncate text-xs" title={ib.address}>{ib.address || "—"}</span>
												{ib.address && <CopyBtn value={ib.address} />}
											</div>
											<div className="text-[11px] text-muted">{ib.addressSource}</div>
										</td>
										<td className="num whitespace-nowrap">{formatNumber(ib.activeClients, locale)} / {formatNumber(ib.clients, locale)}</td>
										<td className="num whitespace-nowrap">
											{formatBytes(ib.panelUp + ib.panelDown)}
											{ib.panelTotal > 0 && (
												<div className="mt-1 w-24"><Progress value={Math.round(((ib.panelUp + ib.panelDown) / ib.panelTotal) * 100)} /></div>
											)}
										</td>
										<td className="num whitespace-nowrap">{formatBytes(ib.up + ib.down)}</td>
										<td><Badge tone={ib.enable ? "success" : "muted"}>{ib.enable ? t("active") : t("inactive")}</Badge></td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>

			<Card title={L("کلاینت‌های این سرور", "Clients on this server")} subtitle={L("به ترتیب بیشترین مصرف", "Ordered by usage")} bodyClassName="px-0 pb-0">
				{data.clients.length === 0 ? (
					<div className="px-5 pb-5"><Empty text={t("nothing_here")} /></div>
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr>
									<th>{L("کلاینت", "Client")}</th>
									<th>{L("وضعیت", "Status")}</th>
									<th>{L("اینباند", "Inbound")}</th>
									<th>{L("شناسه در پنل", "Panel email")}</th>
									<th>{L("مصرف", "Usage")}</th>
									<th>{L("آخرین اتصال", "Last online")}</th>
								</tr>
							</thead>
							<tbody>
								{data.clients.map((c) => (
									<tr key={c.linkId}>
										<td className="font-medium">{c.clientName}</td>
										<td><StatusBadge status={c.clientStatus} /></td>
										<td className="num">{c.inboundId}</td>
										<td>
											<div className="flex items-center gap-1">
												<span className="mono max-w-[200px] truncate text-xs" title={c.remoteEmail}>{c.remoteEmail}</span>
												<CopyBtn value={c.remoteEmail} />
											</div>
											{c.lastError && <div className="mono max-w-[220px] truncate text-[11px] text-danger" title={c.lastError}>{c.lastError}</div>}
										</td>
										<td className="num whitespace-nowrap">
											{formatBytes(c.up + c.down)}
											{!c.enabled && <Badge className="ms-1">{t("inactive")}</Badge>}
										</td>
										<td className="whitespace-nowrap text-xs text-muted">{relativeTime(c.lastOnlineAt, locale)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>

			<Card
				title={L("رخدادها", "Incidents")}
				subtitle={L("۲۰ رخداد آخر این سرور", "Last 20 incidents of this server")}
				bodyClassName="px-0 pb-0"
				actions={data.health.openIncidents > 0 ? <Badge tone="danger"><AlertTriangle className="h-3 w-3" /> {formatNumber(data.health.openIncidents, locale)}</Badge> : undefined}
			>
				{data.incidents.length === 0 ? (
					<div className="px-5 pb-5"><Empty text={L("رخدادی ثبت نشده است", "No incidents recorded")} /></div>
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr>
									<th>{L("نوع", "Kind")}</th>
									<th>{L("وضعیت", "Status")}</th>
									<th>{L("شروع", "Started")}</th>
									<th>{L("مدت", "Duration")}</th>
									<th>{L("پیام", "Message")}</th>
								</tr>
							</thead>
							<tbody>
								{data.incidents.map((i) => (
									<tr key={i.id}>
										<td><Badge tone={KIND_TONE[i.kind] ?? "violet"}>{t(KIND_KEY[i.kind] ?? "inc_OFFLINE")}</Badge></td>
										<td><Badge tone={i.status === "OPEN" ? "danger" : "success"}>{t(i.status === "OPEN" ? "mon_filter_open" : "mon_filter_resolved")}</Badge></td>
										<td className="whitespace-nowrap text-xs text-muted">{relativeTime(i.startedAt, locale)}</td>
										<td className="num whitespace-nowrap">{duration(i.startedAt, i.resolvedAt, locale)}</td>
										<td className="mono max-w-[280px] truncate text-xs text-muted" title={i.message ?? ""}>{i.message ?? "—"}</td>
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
