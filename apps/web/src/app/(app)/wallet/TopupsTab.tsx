"use client"

import { useMemo, useState } from "react"
import { Clock, Landmark, PlusCircle, RefreshCw, Wallet as WalletIcon } from "lucide-react"
import { formatDate, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Spinner, cx } from "@/components/ui"
import { CopyBtn, MiniStat } from "@/components/bits"
import { PAY_TONE, TOPUP_STATUSES, tr, type Topup } from "./types"

export function TopupsTab({ topups, canTopup, onTopup, onRefresh }: { topups: Topup[] | null; canTopup: boolean; onTopup: () => void; onRefresh: () => void }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const [status, setStatus] = useState("")

	const rows = useMemo(() => (topups ?? []).filter((p) => !status || p.status === status), [topups, status])
	const totals = useMemo(() => {
		const all = topups ?? []
		return {
			confirmed: all.filter((p) => p.status === "CONFIRMED").reduce((n, p) => n + p.amount, 0),
			pending: all.filter((p) => p.status === "REVIEW" || p.status === "PENDING").length,
			count: all.length,
		}
	}, [topups])

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-3">
				<MiniStat icon={<WalletIcon className="h-4 w-4" />} label={L("جمع شارژهای تایید‌شده", "Confirmed total")} value={formatNumber(totals.confirmed, locale)} tone="success" />
				<MiniStat icon={<Clock className="h-4 w-4" />} label={t("wal_pending_topups")} value={formatNumber(totals.pending, locale)} tone={totals.pending ? "warning" : "success"} />
				<MiniStat icon={<Landmark className="h-4 w-4" />} label={L("تعداد درخواست‌ها", "Requests")} value={formatNumber(totals.count, locale)} />
			</div>

			<Card
				title={t("wal_tab_topups")}
				actions={
					<div className="flex items-center gap-2">
						<Button type="button" size="sm" variant="ghost" onClick={onRefresh}><RefreshCw className="h-4 w-4" /></Button>
						{canTopup && <Button type="button" size="sm" variant="primary" onClick={onTopup}><PlusCircle className="h-4 w-4" /> {t("wal_topup")}</Button>}
					</div>
				}
			>
				<div className="mb-3 flex flex-wrap gap-1.5">
					<button type="button" onClick={() => setStatus("")} className={cx("chip", status === "" && "chip-on")}>{t("pay_all")}</button>
					{TOPUP_STATUSES.map((s) => (
						<button type="button" key={s} onClick={() => setStatus(s)} className={cx("chip", status === s && "chip-on")}>{t(`pay_st_${s}` as never)}</button>
					))}
				</div>

				{!topups ? (
					<div className="flex justify-center p-10"><Spinner /></div>
				) : rows.length === 0 ? (
					<Empty text={t("wal_topups_empty")} action={canTopup ? <Button type="button" variant="primary" onClick={onTopup}><PlusCircle className="h-4 w-4" /> {t("wal_topup")}</Button> : undefined} />
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead><tr><th>{t("pay_method")}</th><th>{t("ord_amount")}</th><th>{t("pay_proof")}</th><th>{t("status")}</th><th>{t("created_at")}</th></tr></thead>
							<tbody>
								{rows.map((p) => (
									<tr key={p.id} className={cx(p.status === "REVIEW" && "bg-warning/5")}>
										<td><Badge tone="cyan">{t(`pay_m_${p.method}` as never)}</Badge></td>
										<td className="num">
											{formatNumber(p.amount, locale)}
											{p.amountUsdt ? <div className="text-xs text-muted">{p.amountUsdt} USDT</div> : null}
										</td>
										<td className="max-w-[220px] text-xs text-muted">
											{p.txid || p.receiptRef ? (
												<div className="flex items-center gap-1">
													<span className="mono truncate" title={p.txid || p.receiptRef || ""}>{p.txid || p.receiptRef}</span>
													<CopyBtn value={(p.txid || p.receiptRef) as string} />
												</div>
											) : (
												"—"
											)}
											{p.reviewNote && <div className="text-danger">{p.reviewNote}</div>}
										</td>
										<td><Badge tone={PAY_TONE[p.status] ?? "muted"}>{t(`pay_st_${p.status}` as never)}</Badge></td>
										<td className="text-muted">{formatDate(p.createdAt, locale, true)}</td>
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
