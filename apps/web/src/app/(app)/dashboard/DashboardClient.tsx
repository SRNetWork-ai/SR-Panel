"use client"

import Link from "next/link"
import { Activity, ArrowDownToLine, Clock3, Server, ShieldCheck, Users, Wifi } from "lucide-react"
import type { DashboardStats } from "@srpanel/core"
import { formatBytes, formatNumber, percent, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { UsageAreaChart } from "@/components/Charts"
import { Card, Empty, Progress, Stat, StatusBadge } from "@/components/ui"

export function DashboardClient({ stats, isOwner }: { stats: DashboardStats; isOwner: boolean }) {
	const t = useT()
	const locale = useLocale()
	const n = (v: number) => formatNumber(v, locale)

	return (
		<>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
				<Stat label={t("dash_clients_total")} value={n(stats.clients.total)} sub={`${t("dash_active")}: ${n(stats.clients.active)}`} icon={<Users className="h-5 w-5" />} accent="violet" />
				<Stat label={t("dash_online_now")} value={n(stats.clients.onlineNow)} icon={<Wifi className="h-5 w-5" />} accent="success" />
				<Stat label={t("dash_expiring")} value={n(stats.clients.expiringSoon)} sub={`${t("st_EXPIRED")}: ${n(stats.clients.expired)} • ${t("st_LIMITED")}: ${n(stats.clients.limited)}`} icon={<Clock3 className="h-5 w-5" />} accent="warning" />
				<Stat label={t("dash_servers")} value={`${n(stats.servers.online)} / ${n(stats.servers.total)}`} sub={stats.servers.offline ? `${t("st_OFFLINE")}: ${n(stats.servers.offline)}` : undefined} icon={<Server className="h-5 w-5" />} accent={stats.servers.offline ? "danger" : "cyan"} />
				<Stat label={t("dash_traffic_today")} value={formatBytes(stats.traffic.todayBytes)} icon={<Activity className="h-5 w-5" />} accent="magenta" />
				<Stat label={t("dash_traffic_total")} value={formatBytes(stats.traffic.usedBytes)} sub={`${t("dash_allocated")}: ${formatBytes(stats.traffic.allocatedBytes)}`} icon={<ArrowDownToLine className="h-5 w-5" />} accent="cyan" />
			</div>

			<div className="grid gap-4 xl:grid-cols-3">
				<Card title={t("dash_usage_14d")} className="xl:col-span-2">
					<UsageAreaChart data={stats.usageSeries} />
				</Card>

				<Card title={t("dash_server_health")} actions={isOwner ? <Link href="/servers" className="btn btn-sm">{t("all")}</Link> : undefined}>
					{stats.serverList.length === 0 ? (
						<Empty text={t("srv_empty")} action={isOwner ? <Link href="/servers" className="btn btn-primary btn-sm">{t("srv_add")}</Link> : undefined} />
					) : (
						<ul className="space-y-3">
							{stats.serverList.map((s) => (
								<li key={s.id} className="space-y-1.5">
									<div className="flex items-center justify-between gap-2">
										<div className="flex min-w-0 items-center gap-2">
											<span className={`h-2 w-2 shrink-0 rounded-full ${s.status === "ONLINE" ? "bg-success pulse-dot" : s.status === "OFFLINE" || s.status === "AUTH_ERROR" ? "bg-danger" : "bg-warning"}`} />
											<span className="truncate text-sm font-medium">{s.name}</span>
										</div>
										<span className="text-[11px] text-muted">{n(s.clients)} {t("srv_clients")}</span>
									</div>
									<div className="grid grid-cols-2 gap-2 text-[11px] text-muted">
										<div>
											<div className="mb-0.5 flex justify-between"><span>{t("cpu")}</span><span className="num">{s.cpu === null ? "—" : `${Math.round(s.cpu)}%`}</span></div>
											<Progress value={s.cpu ?? 0} />
										</div>
										<div>
											<div className="mb-0.5 flex justify-between"><span>{t("memory")}</span><span className="num">{s.memPct === null ? "—" : `${s.memPct}%`}</span></div>
											<Progress value={s.memPct ?? 0} />
										</div>
									</div>
								</li>
							))}
						</ul>
					)}
				</Card>
			</div>

			<div className={`grid gap-4 ${stats.admins ? "xl:grid-cols-3" : ""}`}>
				<Card title={t("dash_recent_clients")} className={stats.admins ? "xl:col-span-2" : ""} actions={<Link href="/clients" className="btn btn-sm">{t("all")}</Link>} bodyClassName="px-0 pb-2">
					{stats.recentClients.length === 0 ? (
						<Empty text={t("cl_empty")} action={<Link href="/clients?new=1" className="btn btn-primary btn-sm">{t("cl_add")}</Link>} />
					) : (
						<div className="table-wrap">
							<table className="table">
								<thead>
									<tr>
										<th>{t("name")}</th>
										<th>{t("status")}</th>
										<th className="w-48">{t("cl_usage")}</th>
										<th>{t("cl_created")}</th>
									</tr>
								</thead>
								<tbody>
									{stats.recentClients.map((c) => {
										const pct = c.trafficLimit > 0 ? percent(c.usedBytes, c.trafficLimit) : 0
										return (
											<tr key={c.id}>
												<td><Link href={`/clients/${c.id}`} className="font-medium hover:text-violet-soft">{c.name}</Link></td>
												<td><StatusBadge status={c.status} /></td>
												<td>
													<div className="mb-1 flex justify-between text-[11px] text-muted"><span className="num">{formatBytes(c.usedBytes)}</span><span className="num">{c.trafficLimit > 0 ? formatBytes(c.trafficLimit) : "∞"}</span></div>
													<Progress value={pct} />
												</td>
												<td className="text-xs text-muted">{relativeTime(c.createdAt, locale)}</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					)}
				</Card>

				{stats.admins && (
					<Card title={t("dash_admins")} actions={<Link href="/admins" className="btn btn-sm">{t("all")}</Link>}>
						<div className="flex items-center gap-4">
							<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet/30 to-cyan/10 text-violet-soft"><ShieldCheck className="h-7 w-7" /></div>
							<div>
								<div className="num text-3xl font-bold">{n(stats.admins.total)}</div>
								<div className="text-xs text-muted">{t("active")}: {n(stats.admins.active)}</div>
							</div>
						</div>
					</Card>
				)}
			</div>
		</>
	)
}
