"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, Clock, ExternalLink, Eye, RefreshCw, RotateCcw, Search, ShoppingCart, Wallet as WalletIcon, XCircle } from "lucide-react"
import { api } from "@/lib/client"
import { formatDate, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Input, Modal, Spinner, SubHead, cx, useConfirm, useToast } from "@/components/ui"
import { CopyBtn, MiniStat } from "@/components/bits"
import { ORDER_STATUSES, ORDER_TONE, PAY_TONE, tronTxUrl, tr, type List, type OrderRow } from "./types"

export function OrdersTab({ isOwner, refreshKey }: { isOwner: boolean; refreshKey: number }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const confirmDlg = useConfirm()
	const [status, setStatus] = useState("")
	const [q, setQ] = useState("")
	const [data, setData] = useState<List<OrderRow> | null>(null)
	const [busy, setBusy] = useState<string | null>(null)
	const [detail, setDetail] = useState<OrderRow | null>(null)

	const load = useCallback(async () => {
		const params = new URLSearchParams({ take: "100" })
		if (status) params.set("status", status)
		if (q.trim()) params.set("q", q.trim())
		setData(await api<List<OrderRow>>(`/api/orders?${params}`))
	}, [status, q])
	useEffect(() => {
		const h = setTimeout(() => load().catch(() => undefined), 250)
		return () => clearTimeout(h)
	}, [load, refreshKey])

	const totals = useMemo(() => {
		const items = data?.items ?? []
		return {
			count: data?.total ?? items.length,
			sum: items.filter((o) => o.status === "FULFILLED" || o.status === "PAID").reduce((n, o) => n + o.amount, 0),
			pending: items.filter((o) => o.status === "PENDING").length,
			failed: items.filter((o) => !!o.error).length,
		}
	}, [data])

	async function act(o: OrderRow, action: "fulfill" | "cancel") {
		if (action === "cancel" && !confirmDlg(t("ord_cancel_confirm"))) return
		if (action === "fulfill" && o.status === "PENDING" && !confirmDlg(t("ord_manual_paid_confirm"))) return
		setBusy(o.id)
		try {
			await api(`/api/orders/${o.id}/${action}`, { method: "POST", json: {} })
			toast.ok(t("set_saved"))
			setDetail(null)
			await load()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setBusy(null)
		}
	}

	function Actions({ o }: { o: OrderRow }) {
		return (
			<>
				{(o.status === "PAID" || o.status === "PENDING") && (
					<Button type="button" size="sm" variant="primary" loading={busy === o.id} onClick={() => act(o, "fulfill")}>
						<RotateCcw className="h-4 w-4" /> {o.status === "PENDING" ? t("ord_manual_paid") : t("ord_retry")}
					</Button>
				)}
				{o.status === "PENDING" && (
					<Button type="button" size="sm" variant="danger" loading={busy === o.id} onClick={() => act(o, "cancel")} title={t("cancel")}>
						<XCircle className="h-4 w-4" />
					</Button>
				)}
			</>
		)
	}

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<MiniStat icon={<ShoppingCart className="h-4 w-4" />} label={L("تعداد در این نما", "Rows in view")} value={formatNumber(totals.count, locale)} />
				<MiniStat icon={<WalletIcon className="h-4 w-4" />} label={`${t("ord_amount")} (${t("currency_irt")})`} value={formatNumber(totals.sum, locale)} tone="cyan" />
				<MiniStat icon={<Clock className="h-4 w-4" />} label={t("ord_st_PENDING")} value={formatNumber(totals.pending, locale)} tone={totals.pending ? "warning" : "success"} />
				<MiniStat icon={<AlertTriangle className="h-4 w-4" />} label={L("خطادار", "With errors")} value={formatNumber(totals.failed, locale)} tone={totals.failed ? "danger" : "success"} />
			</div>

			<Card
				title={t("ord_title")}
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<div className="relative">
							<Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
							<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ord_search")} className="ps-9" />
						</div>
						<Button type="button" size="sm" variant="ghost" onClick={() => load().catch(() => undefined)} title={t("ord_recent")}><RefreshCw className="h-4 w-4" /></Button>
					</div>
				}
			>
				<div className="mb-3 flex flex-wrap gap-1.5">
					<button type="button" onClick={() => setStatus("")} className={cx("chip", status === "" && "chip-on")}>{t("pay_all")}</button>
					{ORDER_STATUSES.map((s) => (
						<button type="button" key={s} onClick={() => setStatus(s)} className={cx("chip", status === s && "chip-on")}>{t(`ord_st_${s}` as never)}</button>
					))}
				</div>

				{!data ? (
					<div className="flex justify-center p-10"><Spinner /></div>
				) : data.items.length === 0 ? (
					<Empty text={t("ord_empty")} />
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr><th>{t("plan_name")}</th><th>{t("ord_customer")}</th><th>{t("ord_amount")}</th><th>{t("pay_method")}</th>{isOwner && <th>{t("pay_by")}</th>}<th>{t("status")}</th><th>{t("created_at")}</th><th /></tr>
							</thead>
							<tbody>
								{data.items.map((o) => {
									const pay = o.payments[0]
									return (
										<tr key={o.id} className={cx(o.error && "bg-danger/5", o.status === "PENDING" && "bg-warning/5")}>
											<td>
												<div className="flex items-center gap-1.5 font-medium">
													{o.plan?.name ?? "—"}
													{o.renewClientId && <Badge tone="violet">{t("ord_renew")}</Badge>}
												</div>
												{o.client && <a className="text-xs text-cyan" href={`/clients/${o.client.id}`}>{o.client.name}</a>}
												{o.error && <div className="line-clamp-2 text-xs text-danger">{o.error}</div>}
											</td>
											<td className="text-xs">
												<div>{o.customerName || "—"}</div>
												<div className="mono text-muted">{o.customerTelegramId ? `tg:${o.customerTelegramId}` : o.customerPhone || ""}</div>
											</td>
											<td className="num">
												{formatNumber(o.amount, locale)}
												{o.discountAmount > 0 && <div className="text-xs text-success">-{formatNumber(o.discountAmount, locale)} ({o.discountCode})</div>}
											</td>
											<td>
												{pay ? (
													<div className="flex flex-col items-start gap-1">
														<Badge tone="cyan">{t(`pay_m_${pay.method}` as never)}</Badge>
														<Badge tone={PAY_TONE[pay.status] ?? "muted"}>{t(`pay_st_${pay.status}` as never)}</Badge>
													</div>
												) : (
													<span className="text-muted">—</span>
												)}
											</td>
											{isOwner && <td className="text-muted">@{o.admin?.username}</td>}
											<td><Badge tone={ORDER_TONE[o.status] ?? "muted"}>{t(`ord_st_${o.status}` as never)}</Badge></td>
											<td className="text-muted">{formatDate(o.createdAt, locale, true)}</td>
											<td className="text-end">
												<div className="flex justify-end gap-1">
													<Button type="button" size="sm" variant="ghost" onClick={() => setDetail(o)} title={L("جزئیات", "Details")}><Eye className="h-4 w-4" /></Button>
													<a className="btn btn-ghost btn-sm" href={`/shop/o/${o.token}`} target="_blank" rel="noreferrer" title={t("ord_open")}><ExternalLink className="h-4 w-4" /></a>
													<Actions o={o} />
												</div>
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				)}
			</Card>

			<Modal
				open={!!detail}
				onClose={() => setDetail(null)}
				title={detail?.plan?.name || t("ord_title")}
				subtitle={detail ? `${formatDate(detail.createdAt, locale, true)} · ${t(`ord_st_${detail.status}` as never)}` : undefined}
				size="lg"
				footer={
					detail ? (
						<>
							<a className="btn btn-sm me-auto" href={`/shop/o/${detail.token}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> {t("ord_open")}</a>
							<Actions o={detail} />
						</>
					) : undefined
				}
			>
				{detail && (
					<div className="space-y-4">
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="tile space-y-1 text-sm">
								<div className="text-xs text-muted">{t("ord_customer")}</div>
								<div className="font-medium">{detail.customerName || "—"}</div>
								{detail.customerTelegramId && <div className="mono text-xs text-muted">tg:{detail.customerTelegramId}</div>}
								{detail.customerPhone && <div className="mono text-xs text-muted">{detail.customerPhone}</div>}
								{detail.client && <a className="text-xs text-cyan" href={`/clients/${detail.client.id}`}>{detail.client.name}</a>}
								{isOwner && detail.admin && <div className="text-xs text-muted">{t("pay_by")}: @{detail.admin.username}</div>}
							</div>
							<div className="tile space-y-1 text-sm">
								<div className="text-xs text-muted">{t("ord_amount")}</div>
								<div className="num text-lg font-semibold">{formatNumber(detail.amount, locale)} <span className="text-xs text-muted">{t("currency_irt")}</span></div>
								<div className="num text-xs text-muted">{L("قیمت لیست", "List price")}: {formatNumber(detail.listPrice, locale)}</div>
								{detail.discountAmount > 0 && (
									<div className="num text-xs text-success">-{formatNumber(detail.discountAmount, locale)} {detail.discountCode ? `(${detail.discountCode})` : ""}</div>
								)}
								{detail.fulfilledAt && <div className="text-xs text-muted">{t("ord_st_FULFILLED")}: {formatDate(detail.fulfilledAt, locale, true)}</div>}
							</div>
						</div>

						<div className="tile flex flex-wrap items-center gap-2 text-xs">
							<span className="text-muted">{L("شناسهٔ سفارش", "Order token")}</span>
							<code className="mono truncate">{detail.token}</code>
							<CopyBtn value={detail.token} />
						</div>

						{detail.error && (
							<div className="tile border-danger/40 text-sm text-danger">
								<div className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" /> {t("error_generic")}</div>
								<div className="mt-1 break-words text-xs">{detail.error}</div>
							</div>
						)}

						<div>
							<SubHead title={t("pay_title")} hint={L("پرداخت‌های ثبت‌شده برای این سفارش", "Payments recorded for this order")} />
							{detail.payments.length === 0 ? (
								<Empty text={t("pay_empty")} />
							) : (
								<div className="space-y-2">
									{detail.payments.map((p) => (
										<div key={p.id} className="tile flex flex-wrap items-center gap-2 text-xs">
											<Badge tone="cyan">{t(`pay_m_${p.method}` as never)}</Badge>
											<Badge tone={PAY_TONE[p.status] ?? "muted"}>{t(`pay_st_${p.status}` as never)}</Badge>
											{p.txid && (
												<a className="mono truncate text-cyan" title={p.txid} href={tronTxUrl(p.txid)} target="_blank" rel="noreferrer">{p.txid.slice(0, 10)}…{p.txid.slice(-6)}</a>
											)}
											{p.receiptRef && <span className="mono text-muted">{t("pay_ref")}: {p.receiptRef}</span>}
											{p.receiptFile && (
												<a className="ms-auto inline-flex items-center gap-1 text-cyan" href={`/api/files/receipt/${p.id}`} target="_blank" rel="noreferrer">{t("pay_receipt_file")}</a>
											)}
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				)}
			</Modal>
		</div>
	)
}
