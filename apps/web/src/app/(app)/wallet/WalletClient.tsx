"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Clock, Coins, Gauge, Landmark, PlusCircle, RefreshCw, Users, Wallet } from "lucide-react"
import { api } from "@/lib/client"
import { formatBytes, formatDate, formatNumber, percent } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Button, Card, PageHeader, Stat, Tabs, cx } from "@/components/ui"
import { LedgerTab } from "./LedgerTab"
import { OwnerPanel } from "./OwnerPanel"
import { TopupModal } from "./TopupModal"
import { TopupsTab } from "./TopupsTab"
import { tr, type Overview, type Topup, type Tx } from "./types"

type Tab = "ledger" | "topups" | "owner"

export function WalletClient({ initial }: { initial: Overview }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const [data, setData] = useState<Overview>(initial)
	const [txs, setTxs] = useState<Tx[] | null>(null)
	const [topups, setTopups] = useState<Topup[] | null>(null)
	const [open, setOpen] = useState(false)
	const [tab, setTab] = useState<Tab>(initial.isOwner ? "owner" : "ledger")

	const refresh = useCallback(async () => {
		const [o, l, tp] = await Promise.all([
			api<Overview>("/api/wallet"),
			api<{ items: Tx[] }>("/api/wallet/txs?take=100"),
			api<{ items: Topup[] }>("/api/wallet/topup"),
		])
		setData(o)
		setTxs(l.items)
		setTopups(tp.items)
	}, [])
	useEffect(() => {
		refresh().catch(() => undefined)
	}, [refresh])

	const reload = () => refresh().catch(() => undefined)
	const limits = data.isOwner ? null : data.limits
	const lowBalance = !data.isOwner && data.lowBalance > 0 && data.balance < data.lowBalance

	return (
		<div className="space-y-6 fade-up">
			<PageHeader
				title={t("wal_title")}
				subtitle={data.isOwner ? t("wal_sub_owner") : t("wal_sub")}
				actions={
					<div className="flex items-center gap-2">
						<Button type="button" size="sm" variant="ghost" onClick={reload} title={t("wal_title")}><RefreshCw className="h-4 w-4" /></Button>
						{!data.isOwner && (
							<Button type="button" variant="primary" onClick={() => setOpen(true)}><PlusCircle className="h-4 w-4" /> {t("wal_topup")}</Button>
						)}
					</div>
				}
			/>

			{lowBalance && (
				<div className="glass-2 flex items-start gap-2 rounded-xl border border-warning/30 p-3 text-xs text-warning">
					<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
					<span className="num">
						{L("موجودی کیف پول شما از آستانهٔ هشدار کمتر است", "Your wallet balance is below the alert threshold")}
						{" ("}{formatNumber(data.lowBalance, locale)} {t("currency_irt")}{"). "}
						{data.creditLimit > 0
							? L(`سقف بدهی مجاز: ${formatNumber(data.creditLimit, locale)} تومان`, `Credit limit: ${formatNumber(data.creditLimit, locale)}`)
							: L("برای ساخت سرویس جدید کیف پول را شارژ کنید.", "Top up your wallet to keep creating services.")}
					</span>
				</div>
			)}

			{!data.isOwner && (
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<Stat
						label={t("wal_balance")}
						value={<span className={cx("num", data.balance < 0 && "text-danger")}>{formatNumber(data.balance, locale)}</span>}
						sub={t("currency_irt")}
						icon={<Wallet className="h-5 w-5" />}
						accent={data.balance < 0 ? "danger" : "violet"}
					/>
					<Stat label={t("wal_spent_30d")} value={<span className="num">{formatNumber(data.spent30d, locale)}</span>} sub={t("currency_irt")} icon={<ArrowUpCircle className="h-5 w-5" />} accent="magenta" />
					<Stat
						label={t("wal_unit_prices")}
						value={
							data.unit.billingEnabled ? (
								<span className="num text-base">
									{formatNumber(data.unit.perGB, locale)} <span className="text-xs text-muted">/GB</span> · {formatNumber(data.unit.perDay, locale)} <span className="text-xs text-muted">/{t("plan_days")}</span>
								</span>
							) : (
								<span className="text-base">{t("wal_billing_off")}</span>
							)
						}
						icon={<Coins className="h-5 w-5" />}
						accent="cyan"
					/>
					<Stat label={t("wal_pending_topups")} value={<span className="num">{formatNumber(data.pendingTopups, locale)}</span>} icon={<ArrowDownCircle className="h-5 w-5" />} accent={data.pendingTopups ? "warning" : "success"} />
				</div>
			)}

			{limits && (
				<Card title={L("سهمیه و محدودیت‌های من", "My quota & limits")} subtitle={L("سقف‌هایی که مالک پنل برای حساب شما تعیین کرده است", "Caps the panel owner set for your account")}>
					<div className="grid gap-3 sm:grid-cols-3">
						<div className="tile space-y-1.5">
							<div className="flex items-center justify-between gap-2 text-xs">
								<span className="flex items-center gap-1.5 font-medium"><Gauge className="h-3.5 w-3.5 text-violet-soft" />{L("سهمیهٔ ترافیک", "Traffic quota")}</span>
								<span className="num text-muted">{limits.trafficQuota === null ? "∞" : `${formatBytes(limits.allocated)} / ${formatBytes(limits.trafficQuota)}`}</span>
							</div>
							{limits.trafficQuota === null ? (
								<p className="text-[11px] text-muted">{L("سهمیهٔ ترافیک شما نامحدود است.", "Your traffic quota is unlimited.")}</p>
							) : (
								<>
									<div className="h-1.5 overflow-hidden rounded-full bg-white/10">
										<div className={cx("h-full rounded-full", percent(limits.allocated, limits.trafficQuota) >= 90 ? "bg-danger" : "bg-violet")} style={{ width: `${percent(limits.allocated, limits.trafficQuota)}%` }} />
									</div>
									<p className="num text-[11px] text-muted">{L("باقی‌مانده", "Remaining")}: {formatBytes(Math.max(0, limits.remaining ?? 0))}</p>
								</>
							)}
						</div>

						<div className="tile space-y-1.5">
							<div className="flex items-center justify-between gap-2 text-xs">
								<span className="flex items-center gap-1.5 font-medium"><Users className="h-3.5 w-3.5 text-violet-soft" />{t("nav_clients")}</span>
								<span className="num text-muted">{formatNumber(limits.clients, locale)}{limits.clientLimit === null ? " / ∞" : ` / ${formatNumber(limits.clientLimit, locale)}`}</span>
							</div>
							<p className="num text-[11px] text-muted">
								{limits.clientsRemaining === null
									? L("بدون محدودیت تعداد کلاینت", "No client-count limit")
									: `${L("ظرفیت باقی‌مانده", "Slots left")}: ${formatNumber(limits.clientsRemaining, locale)}`}
							</p>
						</div>

						<div className="tile space-y-1.5">
							<div className="flex items-center justify-between gap-2 text-xs">
								<span className="flex items-center gap-1.5 font-medium"><Clock className="h-3.5 w-3.5 text-violet-soft" />{L("اعتبار حساب", "Account validity")}</span>
								<span className={cx("num", limits.expired ? "text-danger" : "text-muted")}>{limits.expiresAt === null ? "∞" : formatDate(limits.expiresAt, locale)}</span>
							</div>
							<p className="num text-[11px] text-muted">
								{limits.expired
									? L("حساب شما منقضی شده است؛ امکان ساخت یا تمدید کلاینت وجود ندارد.", "Your account has expired - creating or renewing clients is blocked.")
									: `${L("سقف بدهی مجاز", "Credit limit")}: ${formatNumber(data.creditLimit, locale)} ${t("currency_irt")}`}
							</p>
						</div>
					</div>
				</Card>
			)}

			<Tabs<Tab>
				value={tab}
				onChange={setTab}
				tabs={[
					...(data.isOwner ? [{ id: "owner" as const, label: t("wal_tab_owner"), icon: <Users className="h-4 w-4" /> }] : []),
					{ id: "ledger", label: t("wal_tab_ledger"), icon: <Coins className="h-4 w-4" /> },
					{ id: "topups", label: t("wal_tab_topups"), icon: <Landmark className="h-4 w-4" />, count: data.pendingTopups > 0 ? data.pendingTopups : undefined },
				]}
			/>

			{tab === "owner" && data.isOwner && <OwnerPanel />}
			{tab === "ledger" && <LedgerTab txs={txs} onRefresh={reload} />}
			{tab === "topups" && <TopupsTab topups={topups} canTopup={!data.isOwner} onTopup={() => setOpen(true)} onRefresh={reload} />}

			<TopupModal open={open} onClose={() => setOpen(false)} methods={data.topupMethods} onDone={reload} />
		</div>
	)
}
