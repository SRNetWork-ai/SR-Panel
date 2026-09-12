"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowDownCircle, ArrowUpCircle, Coins, Landmark, PlusCircle, RefreshCw, Users, Wallet } from "lucide-react"
import { api } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Button, PageHeader, Stat, Tabs, cx } from "@/components/ui"
import { LedgerTab } from "./LedgerTab"
import { OwnerPanel } from "./OwnerPanel"
import { TopupModal } from "./TopupModal"
import { TopupsTab } from "./TopupsTab"
import type { Overview, Topup, Tx } from "./types"

type Tab = "ledger" | "topups" | "owner"

export function WalletClient({ initial }: { initial: Overview }) {
	const t = useT()
	const locale = useLocale()
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
