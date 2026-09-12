"use client"

import { useMemo, useState } from "react"
import { ArrowDownCircle, ArrowUpCircle, Coins, RefreshCw, Search } from "lucide-react"
import { formatDate, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Input, Spinner, cx } from "@/components/ui"
import { MiniStat } from "@/components/bits"
import { KIND_TONE, TX_KINDS, tr, type Tx } from "./types"

export function LedgerTab({ txs, onRefresh }: { txs: Tx[] | null; onRefresh: () => void }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const [kind, setKind] = useState("")
	const [q, setQ] = useState("")

	const rows = useMemo(() => {
		const needle = q.trim().toLowerCase()
		return (txs ?? []).filter((x) => {
			if (kind && x.kind !== kind) return false
			if (!needle) return true
			return `${x.note ?? ""} ${x.refType ?? ""} ${x.refId ?? ""}`.toLowerCase().includes(needle)
		})
	}, [txs, kind, q])

	const totals = useMemo(() => {
		const credit = rows.filter((x) => x.amount > 0).reduce((n, x) => n + x.amount, 0)
		const debit = rows.filter((x) => x.amount < 0).reduce((n, x) => n + x.amount, 0)
		return { credit, debit: Math.abs(debit), net: credit + debit }
	}, [rows])

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-3">
				<MiniStat icon={<ArrowDownCircle className="h-4 w-4" />} label={L("جمع واریز", "Total in")} value={formatNumber(totals.credit, locale)} tone="success" />
				<MiniStat icon={<ArrowUpCircle className="h-4 w-4" />} label={L("جمع برداشت", "Total out")} value={formatNumber(totals.debit, locale)} tone="danger" />
				<MiniStat icon={<Coins className="h-4 w-4" />} label={L("خالص در این نما", "Net in view")} value={formatNumber(totals.net, locale)} tone={totals.net < 0 ? "warning" : "cyan"} />
			</div>

			<Card
				title={t("wal_tab_ledger")}
				subtitle={`${formatNumber(rows.length, locale)} / ${formatNumber(txs?.length ?? 0, locale)}`}
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<div className="relative">
							<Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
							<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("wal_note")} className="ps-9" />
						</div>
						<Button type="button" size="sm" variant="ghost" onClick={onRefresh}><RefreshCw className="h-4 w-4" /></Button>
					</div>
				}
			>
				<div className="mb-3 flex flex-wrap gap-1.5">
					<button type="button" onClick={() => setKind("")} className={cx("chip", kind === "" && "chip-on")}>{t("pay_all")}</button>
					{TX_KINDS.map((k) => (
						<button type="button" key={k} onClick={() => setKind(k)} className={cx("chip", kind === k && "chip-on")}>{t(`wal_k_${k}` as never)}</button>
					))}
				</div>

				{!txs ? (
					<div className="flex justify-center p-10"><Spinner /></div>
				) : rows.length === 0 ? (
					<Empty text={t("wal_ledger_empty")} />
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead><tr><th>{t("wal_kind")}</th><th>{t("wal_note")}</th><th>{t("ord_amount")}</th><th>{t("wal_balance_after")}</th><th>{t("created_at")}</th></tr></thead>
							<tbody>
								{rows.map((x) => (
									<tr key={x.id}>
										<td><Badge tone={KIND_TONE[x.kind] ?? "muted"}>{t(`wal_k_${x.kind}` as never)}</Badge></td>
										<td className="max-w-[280px] text-xs text-muted">{x.note || (x.refType ? `${x.refType} ${x.refId?.slice(0, 8) ?? ""}` : "—")}</td>
										<td className={cx("num font-semibold", x.amount < 0 ? "text-danger" : "text-success")}>{x.amount > 0 ? "+" : ""}{formatNumber(x.amount, locale)}</td>
										<td className="num text-muted">{formatNumber(x.balanceAfter, locale)}</td>
										<td className="text-muted">{formatDate(x.createdAt, locale, true)}</td>
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
