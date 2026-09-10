"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, CreditCard, ExternalLink, FileImage, RefreshCw, RotateCcw, Search, ShoppingCart, XCircle } from "lucide-react"
import { api } from "@/lib/client"
import { formatDate, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, cx, useConfirm, useToast } from "@/components/ui"

type OrderRow = {
	id: string
	token: string
	status: "PENDING" | "PAID" | "FULFILLED" | "CANCELED" | "EXPIRED"
	amount: number
	listPrice: number
	discountCode: string | null
	discountAmount: number
	customerName: string | null
	customerTelegramId: string | null
	customerPhone: string | null
	error: string | null
	createdAt: string
	fulfilledAt: string | null
	renewClientId: string | null
	plan: { name: string } | null
	client: { id: string; name: string } | null
	admin?: { username: string }
	payments: Array<{ id: string; method: string; status: string; txid: string | null; receiptRef: string | null; receiptFile: string | null }>
}
type PaymentRow = {
	id: string
	kind: "ORDER" | "TOPUP"
	method: "USDT" | "CARD" | "ZARINPAL" | "WALLET" | "MANUAL"
	status: "PENDING" | "REVIEW" | "CONFIRMED" | "REJECTED" | "EXPIRED"
	amount: number
	amountUsdt: string | null
	txid: string | null
	receiptRef: string | null
	receiptFile: string | null
	cardPan: string | null
	refId: string | null
	reviewNote: string | null
	error: string | null
	createdAt: string
	admin: { username: string; displayName: string | null }
	order: { id: string; token: string; status: string; customerName: string | null; customerTelegramId: string | null; planSnapshot: { name?: string } | null } | null
}
type List<T> = { items: T[]; total: number }

const ORDER_TONE: Record<string, "success" | "warning" | "danger" | "muted" | "violet" | "cyan"> = { PENDING: "warning", PAID: "cyan", FULFILLED: "success", CANCELED: "muted", EXPIRED: "danger" }
const PAY_TONE: Record<string, "success" | "warning" | "danger" | "muted" | "violet" | "cyan"> = { PENDING: "muted", REVIEW: "warning", CONFIRMED: "success", REJECTED: "danger", EXPIRED: "muted" }

function PaymentsTab({ isOwner, onChanged }: { isOwner: boolean; onChanged: () => void }) {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const [status, setStatus] = useState<string>("REVIEW")
	const [data, setData] = useState<List<PaymentRow> | null>(null)
	const [busy, setBusy] = useState<string | null>(null)
	const [reject, setReject] = useState<PaymentRow | null>(null)
	const [note, setNote] = useState("")

	const load = useCallback(async () => {
		setData(await api<List<PaymentRow>>(`/api/payments?take=100${status ? `&status=${status}` : ""}`))
	}, [status])
	useEffect(() => {
		load().catch(() => undefined)
	}, [load])

	async function confirm(p: PaymentRow) {
		setBusy(p.id)
		try {
			await api(`/api/payments/${p.id}/confirm`, { method: "POST", json: {} })
			toast.ok(t("pay_confirmed"))
			await load()
			onChanged()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setBusy(null)
		}
	}
	async function doReject() {
		if (!reject) return
		setBusy(reject.id)
		try {
			await api(`/api/payments/${reject.id}/reject`, { method: "POST", json: { note: note || null } })
			toast.ok(t("pay_rejected"))
			setReject(null)
			setNote("")
			await load()
			onChanged()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setBusy(null)
		}
	}

	return (
		<Card
			title={t("pay_title")}
			actions={
				<div className="flex items-center gap-2">
					<Select value={status} onChange={(e) => setStatus(e.target.value)}>
						<option value="">{t("pay_all")}</option>
						{["REVIEW", "PENDING", "CONFIRMED", "REJECTED", "EXPIRED"].map((s) => <option key={s} value={s}>{t(`pay_st_${s}` as never)}</option>)}
					</Select>
					<Button size="sm" variant="ghost" onClick={() => load()}><RefreshCw className="h-4 w-4" /></Button>
				</div>
			}
		>
			{!data ? <div className="flex justify-center p-10"><Spinner /></div> : data.items.length === 0 ? <Empty text={t("pay_empty")} /> : (
				<div className="table-wrap">
					<table className="table">
						<thead>
							<tr><th>{t("pay_kind")}</th><th>{t("pay_method")}</th><th>{t("ord_amount")}</th><th>{t("pay_proof")}</th>{isOwner && <th>{t("pay_by")}</th>}<th>{t("status")}</th><th>{t("created_at")}</th><th /></tr>
						</thead>
						<tbody>
							{data.items.map((p) => (
								<tr key={p.id}>
									<td>
										<div className="font-medium">{p.kind === "TOPUP" ? t("pay_kind_TOPUP") : p.order?.planSnapshot?.name || t("pay_kind_ORDER")}</div>
										{p.order && <div className="text-xs text-muted">{p.order.customerName || p.order.customerTelegramId || p.order.token.slice(0, 8)}</div>}
									</td>
									<td><Badge tone="cyan">{t(`pay_m_${p.method}` as never)}</Badge></td>
									<td className="num">{formatNumber(p.amount, locale)}{p.amountUsdt ? <div className="text-xs text-muted">{p.amountUsdt} USDT</div> : null}</td>
									<td className="max-w-[220px] text-xs">
										{p.txid && <div className="mono truncate" title={p.txid}><a className="text-cyan" href={`https://tronscan.org/#/transaction/${p.txid}`} target="_blank" rel="noreferrer">{p.txid.slice(0, 10)}…{p.txid.slice(-6)}</a></div>}
										{p.receiptRef && <div className="mono truncate">{t("pay_ref")}: {p.receiptRef}</div>}
										{p.cardPan && <div className="mono">{t("pay_card_pan")}: {p.cardPan}</div>}
										{p.refId && <div className="mono">RefID: {p.refId}</div>}
										{p.receiptFile && <a className="inline-flex items-center gap-1 text-cyan" href={`/api/files/receipt/${p.id}`} target="_blank" rel="noreferrer"><FileImage className="h-3.5 w-3.5" /> {t("pay_receipt_file")}</a>}
										{p.reviewNote && <div className="text-muted">{p.reviewNote}</div>}
										{p.error && <div className="text-danger">{p.error}</div>}
									</td>
									{isOwner && <td className="text-muted">@{p.admin.username}</td>}
									<td><Badge tone={PAY_TONE[p.status] ?? "muted"}>{t(`pay_st_${p.status}` as never)}</Badge></td>
									<td className="text-muted">{formatDate(p.createdAt, locale, true)}</td>
									<td className="text-end">
										{(p.status === "REVIEW" || p.status === "PENDING") && (
											<div className="flex justify-end gap-1">
												<Button size="sm" variant="primary" loading={busy === p.id} onClick={() => confirm(p)}><CheckCircle2 className="h-4 w-4" /> {t("pay_confirm")}</Button>
												<Button size="sm" variant="danger" onClick={() => setReject(p)}><XCircle className="h-4 w-4" /></Button>
											</div>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			<Modal open={!!reject} onClose={() => setReject(null)} title={t("pay_reject_title")} footer={<><Button onClick={() => setReject(null)}>{t("cancel")}</Button><Button variant="danger" loading={!!busy} onClick={doReject}>{t("pay_reject")}</Button></>}>
				<Field label={t("pay_reject_note")} hint={t("pay_reject_hint")}><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
			</Modal>
		</Card>
	)
}

function OrdersTab({ isOwner, refreshKey }: { isOwner: boolean; refreshKey: number }) {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirmDlg = useConfirm()
	const [status, setStatus] = useState("")
	const [q, setQ] = useState("")
	const [data, setData] = useState<List<OrderRow> | null>(null)
	const [busy, setBusy] = useState<string | null>(null)

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

	async function act(o: OrderRow, action: "fulfill" | "cancel") {
		if (action === "cancel" && !confirmDlg(t("ord_cancel_confirm"))) return
		if (action === "fulfill" && o.status === "PENDING" && !confirmDlg(t("ord_manual_paid_confirm"))) return
		setBusy(o.id)
		try {
			await api(`/api/orders/${o.id}/${action}`, { method: "POST", json: {} })
			toast.ok(t("set_saved"))
			await load()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setBusy(null)
		}
	}

	return (
		<Card
			title={t("ord_title")}
			actions={
				<div className="flex flex-wrap items-center gap-2">
					<div className="relative">
						<Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
						<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ord_search")} className="ps-9" />
					</div>
					<Select value={status} onChange={(e) => setStatus(e.target.value)}>
						<option value="">{t("pay_all")}</option>
						{["PENDING", "PAID", "FULFILLED", "CANCELED", "EXPIRED"].map((s) => <option key={s} value={s}>{t(`ord_st_${s}` as never)}</option>)}
					</Select>
					<Button size="sm" variant="ghost" onClick={() => load()}><RefreshCw className="h-4 w-4" /></Button>
				</div>
			}
		>
			{!data ? <div className="flex justify-center p-10"><Spinner /></div> : data.items.length === 0 ? <Empty text={t("ord_empty")} /> : (
				<div className="table-wrap">
					<table className="table">
						<thead>
							<tr><th>{t("plan_name")}</th><th>{t("ord_customer")}</th><th>{t("ord_amount")}</th><th>{t("pay_method")}</th>{isOwner && <th>{t("pay_by")}</th>}<th>{t("status")}</th><th>{t("created_at")}</th><th /></tr>
						</thead>
						<tbody>
							{data.items.map((o) => {
								const pay = o.payments[0]
								return (
									<tr key={o.id} className={cx(o.error && "bg-danger/5")}>
										<td>
											<div className="font-medium">{o.plan?.name ?? "—"} {o.renewClientId && <Badge tone="violet">{t("ord_renew")}</Badge>}</div>
											{o.client && <a className="text-xs text-cyan" href={`/clients/${o.client.id}`}>{o.client.name}</a>}
											{o.error && <div className="text-xs text-danger">{o.error}</div>}
										</td>
										<td className="text-xs">
											<div>{o.customerName || "—"}</div>
											<div className="mono text-muted">{o.customerTelegramId ? `tg:${o.customerTelegramId}` : o.customerPhone || ""}</div>
										</td>
										<td className="num">
											{formatNumber(o.amount, locale)}
											{o.discountAmount > 0 && <div className="text-xs text-success">-{formatNumber(o.discountAmount, locale)} ({o.discountCode})</div>}
										</td>
										<td>{pay ? <div className="flex flex-col gap-1"><Badge tone="cyan">{t(`pay_m_${pay.method}` as never)}</Badge><Badge tone={PAY_TONE[pay.status] ?? "muted"}>{t(`pay_st_${pay.status}` as never)}</Badge></div> : <span className="text-muted">—</span>}</td>
										{isOwner && <td className="text-muted">@{o.admin?.username}</td>}
										<td><Badge tone={ORDER_TONE[o.status] ?? "muted"}>{t(`ord_st_${o.status}` as never)}</Badge></td>
										<td className="text-muted">{formatDate(o.createdAt, locale, true)}</td>
										<td className="text-end">
											<div className="flex justify-end gap-1">
												<a className="btn btn-ghost btn-sm" href={`/shop/o/${o.token}`} target="_blank" rel="noreferrer" title={t("ord_open")}><ExternalLink className="h-4 w-4" /></a>
												{(o.status === "PAID" || o.status === "PENDING") && <Button size="sm" variant="primary" loading={busy === o.id} onClick={() => act(o, "fulfill")} title={o.status === "PENDING" ? t("ord_manual_paid") : t("ord_retry")}><RotateCcw className="h-4 w-4" /> {o.status === "PENDING" ? t("ord_manual_paid") : t("ord_retry")}</Button>}
												{o.status === "PENDING" && <Button size="sm" variant="danger" loading={busy === o.id} onClick={() => act(o, "cancel")}><XCircle className="h-4 w-4" /></Button>}
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
	)
}

type Tab = "orders" | "payments"

export function OrdersClient({ isOwner, pendingReview }: { isOwner: boolean; pendingReview: number }) {
	const t = useT()
	const [tab, setTab] = useState<Tab>(pendingReview > 0 ? "payments" : "orders")
	const [refreshKey, setRefreshKey] = useState(0)
	const tabs: Array<{ id: Tab; label: string; icon: typeof ShoppingCart; count?: number }> = [
		{ id: "orders", label: t("ord_tab_orders"), icon: ShoppingCart },
		{ id: "payments", label: t("ord_tab_payments"), icon: CreditCard, count: pendingReview },
	]
	return (
		<div className="space-y-6 fade-up">
			<PageHeader title={t("ord_title_page")} subtitle={t("ord_sub")} />
			<div className="glass flex flex-wrap gap-1 rounded-2xl p-1.5">
				{tabs.map((x) => (
					<button key={x.id} type="button" onClick={() => setTab(x.id)} className={cx("flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition", tab === x.id ? "bg-violet/20 text-fg neon-ring" : "text-muted hover:text-fg")}>
						<x.icon className="h-4 w-4" /> {x.label}
						{x.count ? <span className="badge bg-warning/20 text-warning">{x.count}</span> : null}
					</button>
				))}
			</div>
			{tab === "orders" && <OrdersTab isOwner={isOwner} refreshKey={refreshKey} />}
			{tab === "payments" && <PaymentsTab isOwner={isOwner} onChanged={() => setRefreshKey((k) => k + 1)} />}
		</div>
	)
}
