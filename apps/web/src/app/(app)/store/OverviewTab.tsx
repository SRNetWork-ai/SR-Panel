"use client"

import { useCallback, useEffect, useState } from "react"
import { CreditCard, ExternalLink, Link2, Package, Percent, RefreshCw, Settings2, ShoppingBag, TrendingUp, Wallet as WalletIcon } from "lucide-react"
import { api } from "@/lib/client"
import { formatDate, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Spinner, Stat } from "@/components/ui"
import { CopyBtn } from "./parts"
import { ORDER_STATUSES, ORDER_TONE, tr, type Overview, type Tab } from "./types"

export function OverviewTab({ onGoto }: { onGoto: (tab: Tab) => void }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const [data, setData] = useState<Overview | null>(null)
	const [busy, setBusy] = useState(false)
	const load = useCallback(async () => setData(await api<Overview>("/api/store/overview")), [])
	useEffect(() => {
		load().catch(() => undefined)
	}, [load])

	if (!data) return <div className="flex justify-center p-10"><Spinner /></div>
	const total = Object.values(data.counts).reduce((a, b) => a + b, 0)

	return (
		<div className="space-y-5">
			{!data.enabled && (
				<div className="glass flex flex-wrap items-center justify-between gap-3 border border-warning/30 p-4">
					<div className="text-sm">{t("store_disabled_hint")}</div>
					<Button type="button" onClick={() => onGoto("settings")}><Settings2 className="h-4 w-4" /> {t("store_tab_settings")}</Button>
				</div>
			)}

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<Stat label={t("store_revenue_30d")} value={<span className="num">{formatNumber(data.revenue30d, locale)}</span>} sub={t("currency_irt")} icon={<WalletIcon className="h-5 w-5" />} />
				<Stat label={t("store_orders_30d")} value={<span className="num">{formatNumber(total, locale)}</span>} sub={`${formatNumber(data.counts.FULFILLED ?? 0, locale)} ${t("ord_st_FULFILLED")}`} icon={<ShoppingBag className="h-5 w-5" />} accent="cyan" />
				<Stat label={t("pay_pending_review")} value={<span className="num">{formatNumber(data.pendingReview, locale)}</span>} icon={<CreditCard className="h-5 w-5" />} accent={data.pendingReview ? "warning" : "violet"} />
				<Stat label={t("plan_active_count")} value={<span className="num">{formatNumber(data.activePlans, locale)}</span>} icon={<Package className="h-5 w-5" />} accent="success" />
			</div>

			<div className="grid gap-4 lg:grid-cols-5">
				<Card title={<span className="inline-flex items-center gap-2"><Link2 className="h-4 w-4" /> {t("store_link")}</span>} className="lg:col-span-2">
					{data.url ? (
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<input readOnly value={data.url} className="input mono flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
								<CopyBtn value={data.url} />
								<a className="btn btn-ghost btn-sm" href={data.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
							</div>
							<div className="flex flex-wrap gap-1.5">
								{data.methods.length ? data.methods.map((m) => <Badge key={m} tone="cyan">{t(`pay_m_${m}` as never)}</Badge>) : <Badge tone="warning">{t("store_no_methods")}</Badge>}
							</div>
							<p className="text-xs text-muted">{t("store_tg_hint")} <code className="kbd">/start store_{data.slug}</code></p>
							<div className="flex flex-wrap gap-2 pt-1">
								<Button type="button" size="sm" variant="ghost" onClick={() => onGoto("plans")}><Package className="h-4 w-4" /> {t("store_tab_plans")}</Button>
								<Button type="button" size="sm" variant="ghost" onClick={() => onGoto("discounts")}><Percent className="h-4 w-4" /> {t("store_tab_discounts")}</Button>
								<Button type="button" size="sm" variant="ghost" onClick={() => onGoto("settings")}><Settings2 className="h-4 w-4" /> {t("store_tab_settings")}</Button>
							</div>
						</div>
					) : (
						<Empty text={t("store_disabled_hint")} action={<Button type="button" onClick={() => onGoto("settings")}>{t("store_tab_settings")}</Button>} />
					)}
				</Card>

				<Card
					title={<span className="inline-flex items-center gap-2"><TrendingUp className="h-4 w-4" /> {L("وضعیت سفارش‌ها", "Order status")}</span>}
					subtitle={L("۳۰ روز گذشته", "Last 30 days")}
					className="lg:col-span-3"
				>
					<div className="grid gap-2 sm:grid-cols-2">
						{ORDER_STATUSES.map((k) => {
							const n = data.counts[k] ?? 0
							const pct = total ? Math.round((n / total) * 100) : 0
							return (
								<div key={k} className="tile">
									<div className="flex items-center justify-between gap-2">
										<Badge tone={ORDER_TONE[k] ?? "muted"}>{t(`ord_st_${k}` as never)}</Badge>
										<span className="num text-sm font-semibold">{formatNumber(n, locale)} <span className="text-[11px] text-muted">({pct}%)</span></span>
									</div>
									<div className="progress mt-2"><span style={{ width: `${pct}%` }} /></div>
								</div>
							)
						})}
					</div>
				</Card>
			</div>

			<Card
				title={t("ord_recent")}
				actions={
					<>
						<a className="btn btn-ghost btn-sm" href="/orders">{L("همه سفارش‌ها", "All orders")}</a>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							loading={busy}
							onClick={async () => {
								setBusy(true)
								await load().catch(() => undefined)
								setBusy(false)
							}}
						>
							<RefreshCw className="h-4 w-4" />
						</Button>
					</>
				}
			>
				{data.recent.length ? (
					<div className="table-wrap">
						<table className="table">
							<thead><tr><th>{t("plan_name")}</th><th>{t("ord_customer")}</th><th>{t("ord_amount")}</th><th>{t("status")}</th><th>{t("created_at")}</th></tr></thead>
							<tbody>
								{data.recent.map((o) => (
									<tr key={o.id}>
										<td>{o.plan?.name ?? "—"}</td>
										<td className="text-muted">{o.customerName || o.customerTelegramId || "—"}</td>
										<td className="num">{formatNumber(o.amount, locale)}</td>
										<td><Badge tone={ORDER_TONE[o.status] ?? "muted"}>{t(`ord_st_${o.status}` as never)}</Badge></td>
										<td className="text-muted">{formatDate(o.createdAt, locale, true)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : <Empty text={t("ord_empty")} />}
			</Card>
		</div>
	)
}
