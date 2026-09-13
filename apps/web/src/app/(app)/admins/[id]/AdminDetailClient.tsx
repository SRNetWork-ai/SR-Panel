"use client"

import Link from "next/link"
import { ArrowLeft, HardDrive, KeyRound, Layers, ScrollText, Server as ServerIcon, Users, Wallet } from "lucide-react"
import type { AdminDetail } from "@srpanel/core"
import { MiniStat } from "@/components/bits"
import { Badge, Card, Empty, PageHeader, Progress, StatusBadge } from "@/components/ui"
import { formatBytes, formatDate, formatNumber, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { tr } from "../types"

/** Read-only deep view of one reseller: quota, clients, access, wallet, audit. */
export function AdminDetailClient({ detail: d }: { detail: AdminDetail }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const owner = d.role === "OWNER"

	const clientTable = (rows: AdminDetail["topClients"], emptyText: string) =>
		rows.length === 0 ? (
			<div className="px-5 pb-5">
				<Empty text={emptyText} />
			</div>
		) : (
			<div className="table-wrap">
				<table className="table">
					<thead>
						<tr>
							<th>{L("نام", "Name")}</th>
							<th>{L("وضعیت", "Status")}</th>
							<th>{L("مصرف", "Used")}</th>
							<th>{L("حجم", "Limit")}</th>
							<th>{L("سرویس", "Service")}</th>
							<th>{L("سرور", "Servers")}</th>
							<th>{t("ad_expires")}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((c) => (
							<tr key={c.id}>
								<td className="font-medium">{c.name}</td>
								<td>
									<StatusBadge status={c.status} />
								</td>
								<td className="num whitespace-nowrap">
									{formatBytes(c.used)}
									{c.usagePct !== null && <span className="text-[10px] text-muted"> ({formatNumber(c.usagePct, locale)}%)</span>}
								</td>
								<td className="num whitespace-nowrap">{c.trafficLimit > 0 ? formatBytes(c.trafficLimit) : "∞"}</td>
								<td className="truncate text-xs text-muted">{c.serviceName ?? "—"}</td>
								<td className="num">{formatNumber(c.servers, locale)}</td>
								<td className="num whitespace-nowrap">{c.expiresAt ? formatDate(c.expiresAt, locale) : t("never")}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		)

	return (
		<div className="space-y-4 fade-up">
			<PageHeader
				title={d.displayName || d.username}
				subtitle={`@${d.username}`}
				actions={
					<Link href="/admins" className="btn btn-sm btn-ghost">
						<ArrowLeft className="h-4 w-4" />
						{L("بازگشت به لیست", "Back to list")}
					</Link>
				}
			/>

			<div className="flex flex-wrap items-center gap-2">
				<Badge tone={owner ? "violet" : "cyan"}>{owner ? t("owner") : t("admin")}</Badge>
				<Badge tone={d.isActive ? "success" : "muted"}>{d.isActive ? t("active") : t("inactive")}</Badge>
				{d.totpEnabled && (
					<Badge tone="success">
						<KeyRound className="h-3 w-3" /> 2FA
					</Badge>
				)}
				{d.daysLeft !== null && d.daysLeft <= 7 && <Badge tone={d.daysLeft <= 0 ? "danger" : "warning"}>{d.daysLeft <= 0 ? L("منقضی شده", "expired") : L(`${formatNumber(d.daysLeft, locale)} روز مانده`, `${d.daysLeft}d left`)}</Badge>}
				{d.telegramId && <Badge tone="muted">{d.telegramId}</Badge>}
			</div>

			<div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
				<MiniStat icon={<Users className="h-4 w-4" />} label={t("nav_clients")} value={d.clientLimit ? `${formatNumber(d.clients.total, locale)} / ${formatNumber(d.clientLimit, locale)}` : formatNumber(d.clients.total, locale)} tone="cyan" />
				<MiniStat icon={<Users className="h-4 w-4" />} label={t("active")} value={formatNumber(d.clients.active, locale)} tone="success" />
				<MiniStat icon={<HardDrive className="h-4 w-4" />} label={L("ترافیک تخصیص‌یافته", "Allocated")} value={formatBytes(d.quota.allocated)} tone="violet" />
				<MiniStat icon={<HardDrive className="h-4 w-4" />} label={t("ad_used")} value={formatBytes(d.quota.used)} tone="warning" />
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<Card title={t("ad_quota")} subtitle={L("سهمیهٔ کل در برابر حجمی که به کاربران داده شده", "Total quota vs. traffic handed to clients")}>
					<div className="mb-1 flex items-center justify-between text-xs text-muted">
						<span>{formatBytes(d.quota.allocated)}</span>
						<span className="num">{d.trafficQuota === null ? "∞" : formatBytes(d.trafficQuota)}</span>
					</div>
					<Progress value={d.quota.allocatedPct ?? 0} />
					<div className="mt-3 grid grid-cols-2 gap-2 text-xs">
						<div className="tile">
							<div className="text-[10px] text-muted">{L("باقی‌ماندهٔ سهمیه", "Quota left")}</div>
							<div className="num text-sm font-semibold">{d.quota.remaining === null ? "∞" : formatBytes(Math.max(0, d.quota.remaining))}</div>
						</div>
						<div className="tile">
							<div className="text-[10px] text-muted">{L("اعتبار کیف پول", "Wallet credit")}</div>
							<div className="num text-sm font-semibold">{formatNumber(d.credit, locale)}</div>
						</div>
					</div>
					<div className="mt-3 space-y-1 text-[11px] text-muted">
						<div>
							{t("ad_last_login")}: {relativeTime(d.lastLoginAt, locale)} {d.lastLoginIp ? <span className="mono">• {d.lastLoginIp}</span> : null}
						</div>
						<div>
							{t("ad_expires")}: {d.expiresAt ? formatDate(d.expiresAt, locale) : t("never")}
						</div>
						<div>
							{L("ساخته شده", "Created")}: {formatDate(d.createdAt, locale)}
						</div>
					</div>
				</Card>

				<Card title={L("ترکیب کاربران", "Client mix")} subtitle={L("وضعیت فعلی کاربران این ادمین", "Current status of this admin's clients")}>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
						<div className="tile">
							<div className="text-[10px] text-muted">{t("active")}</div>
							<div className="num text-sm font-semibold text-success">{formatNumber(d.clients.active, locale)}</div>
						</div>
						<div className="tile">
							<div className="text-[10px] text-muted">{L("غیرفعال", "Disabled")}</div>
							<div className="num text-sm font-semibold">{formatNumber(d.clients.disabled, locale)}</div>
						</div>
						<div className="tile">
							<div className="text-[10px] text-muted">{L("منقضی", "Expired")}</div>
							<div className="num text-sm font-semibold text-danger">{formatNumber(d.clients.expired, locale)}</div>
						</div>
						<div className="tile">
							<div className="text-[10px] text-muted">{L("اتمام حجم", "Limited")}</div>
							<div className="num text-sm font-semibold text-warning">{formatNumber(d.clients.limited, locale)}</div>
						</div>
					</div>
					{d.clientLimit ? (
						<div className="mt-3">
							<div className="mb-1 flex items-center justify-between text-[11px] text-muted">
								<span>{L("سقف تعداد کاربر", "Client limit")}</span>
								<span className="num">
									{formatNumber(d.clients.total, locale)} / {formatNumber(d.clientLimit, locale)}
								</span>
							</div>
							<Progress value={d.clients.limitPct ?? 0} />
						</div>
					) : null}
					<div className="mt-3 flex flex-wrap items-center gap-1">
						<Layers className="h-3.5 w-3.5 shrink-0 text-muted" />
						{d.services.length === 0 && <span className="text-[11px] text-muted">{L("سرویسی تعیین نشده", "No service assigned")}</span>}
						{d.services.map((s) => (
							<Badge key={s.id} tone={s.isPublic ? "cyan" : s.isActive ? "violet" : "muted"}>
								{s.name}
							</Badge>
						))}
					</div>
				</Card>
			</div>

			<Card
				title={
					<span className="flex items-center gap-2">
						<ServerIcon className="h-4 w-4 text-violet-soft" />
						{L("دسترسی سرور و اینباند", "Server & inbound access")}
					</span>
				}
				subtitle={L("این دسترسی مستقیم است؛ سرویس‌ها جداگانه محدود می‌شوند", "Direct access; services are narrowed on top of it")}
			>
				{d.access.length === 0 ? (
					<Empty text={L("دسترسی مستقیمی ثبت نشده", "No direct access configured")} />
				) : (
					<div className="space-y-2">
						{d.access.map((row) => (
							<div key={row.serverId} className="glass glass-2 p-3">
								<div className="mb-2 flex items-center justify-between gap-2">
									<span className="text-sm font-medium">{row.serverName}</span>
									<StatusBadge status={row.serverStatus} />
								</div>
								<div className="flex flex-wrap gap-1.5">
									{row.inboundIds.length === 0 && <Badge tone="muted">{L("همهٔ اینباندها", "All inbounds")}</Badge>}
									{row.inboundLabels.map((label, i) => (
										<span key={row.serverId + ":" + i} className="mono chip text-[11px]" dir="ltr">
											{label}
										</span>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</Card>

			<Card title={L("پرمصرف‌ترین کاربران", "Top clients")} subtitle={L("۱۰ کاربر با بیشترین مصرف", "10 heaviest clients")} bodyClassName="px-0 pb-0">
				{clientTable(d.topClients, t("nothing_here"))}
			</Card>

			<Card title={L("جدیدترین کاربران", "Newest clients")} bodyClassName="px-0 pb-0">
				{clientTable(d.recentClients, t("nothing_here"))}
			</Card>

			<div className="grid gap-4 lg:grid-cols-2">
				<Card
					title={
						<span className="flex items-center gap-2">
							<Wallet className="h-4 w-4 text-violet-soft" />
							{L("گردش کیف پول", "Wallet ledger")}
						</span>
					}
					bodyClassName="px-0 pb-0"
				>
					{d.wallet.length === 0 ? (
						<div className="px-5 pb-5">
							<Empty text={t("nothing_here")} />
						</div>
					) : (
						<div className="table-wrap">
							<table className="table">
								<thead>
									<tr>
										<th>{L("زمان", "When")}</th>
										<th>{L("نوع", "Kind")}</th>
										<th>{L("مبلغ", "Amount")}</th>
										<th>{L("مانده", "Balance")}</th>
										<th>{L("یادداشت", "Note")}</th>
									</tr>
								</thead>
								<tbody>
									{d.wallet.map((w) => (
										<tr key={w.id}>
											<td className="num whitespace-nowrap">{formatDate(w.createdAt, locale, true)}</td>
											<td>
												<Badge tone={w.amount >= 0 ? "success" : "warning"}>{w.kind}</Badge>
											</td>
											<td className="num whitespace-nowrap">{formatNumber(w.amount, locale)}</td>
											<td className="num whitespace-nowrap">{formatNumber(w.balanceAfter, locale)}</td>
											<td className="max-w-[200px] truncate text-xs text-muted" title={w.note ?? ""}>
												{w.note ?? "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</Card>

				<Card
					title={
						<span className="flex items-center gap-2">
							<ScrollText className="h-4 w-4 text-violet-soft" />
							{L("فعالیت اخیر", "Recent activity")}
						</span>
					}
					bodyClassName="px-0 pb-0"
				>
					{d.audit.length === 0 ? (
						<div className="px-5 pb-5">
							<Empty text={t("nothing_here")} />
						</div>
					) : (
						<div className="table-wrap">
							<table className="table">
								<thead>
									<tr>
										<th>{L("زمان", "When")}</th>
										<th>{L("عملکرد", "Action")}</th>
										<th>IP</th>
									</tr>
								</thead>
								<tbody>
									{d.audit.map((a) => (
										<tr key={a.id}>
											<td className="num whitespace-nowrap">{formatDate(a.at, locale, true)}</td>
											<td className="mono text-xs">{a.action}</td>
											<td className="mono text-xs text-muted">{a.ip ?? "—"}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</Card>
			</div>
		</div>
	)
}
