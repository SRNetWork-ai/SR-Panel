"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Clock, CreditCard, ExternalLink, FileImage, RefreshCw, Wallet as WalletIcon, XCircle } from "lucide-react"
import { api } from "@/lib/client"
import { formatDate, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Modal, Spinner, Textarea, cx, useToast } from "@/components/ui"
import { CopyBtn, MiniStat } from "@/components/bits"
import { PAY_STATUSES, PAY_TONE, tronTxUrl, tr, type List, type PaymentRow } from "./types"

export function PaymentsTab({ isOwner, onChanged }: { isOwner: boolean; onChanged: () => void }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [status, setStatus] = useState<string>("REVIEW")
	const [data, setData] = useState<List<PaymentRow> | null>(null)
	const [busy, setBusy] = useState<string | null>(null)
	const [reject, setReject] = useState<PaymentRow | null>(null)
	const [note, setNote] = useState("")
	const [receipt, setReceipt] = useState<PaymentRow | null>(null)

	const load = useCallback(async () => {
		setData(await api<List<PaymentRow>>(`/api/payments?take=100${status ? `&status=${status}` : ""}`))
	}, [status])
	useEffect(() => {
		load().catch(() => undefined)
	}, [load])

	const totals = useMemo(() => {
		const items = data?.items ?? []
		return {
			count: data?.total ?? items.length,
			sum: items.reduce((n, p) => n + p.amount, 0),
			review: items.filter((p) => p.status === "REVIEW" || p.status === "PENDING").length,
		}
	}, [data])

	async function confirmPay(p: PaymentRow) {
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
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-3">
				<MiniStat icon={<CreditCard className="h-4 w-4" />} label={L("تعداد در این نما", "Rows in view")} value={formatNumber(totals.count, locale)} />
				<MiniStat icon={<WalletIcon className="h-4 w-4" />} label={`${t("ord_amount")} (${t("currency_irt")})`} value={formatNumber(totals.sum, locale)} tone="cyan" />
				<MiniStat icon={<Clock className="h-4 w-4" />} label={t("pay_pending_review")} value={formatNumber(totals.review, locale)} tone={totals.review ? "warning" : "success"} />
			</div>

			<Card
				title={t("pay_title")}
				actions={<Button type="button" size="sm" variant="ghost" onClick={() => load().catch(() => undefined)}><RefreshCw className="h-4 w-4" /></Button>}
			>
				<div className="mb-3 flex flex-wrap gap-1.5">
					<button type="button" onClick={() => setStatus("")} className={cx("chip", status === "" && "chip-on")}>{t("pay_all")}</button>
					{PAY_STATUSES.map((s) => (
						<button type="button" key={s} onClick={() => setStatus(s)} className={cx("chip", status === s && "chip-on")}>{t(`pay_st_${s}` as never)}</button>
					))}
				</div>

				{!data ? (
					<div className="flex justify-center p-10"><Spinner /></div>
				) : data.items.length === 0 ? (
					<Empty text={t("pay_empty")} />
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr><th>{t("pay_kind")}</th><th>{t("pay_method")}</th><th>{t("ord_amount")}</th><th>{t("pay_proof")}</th>{isOwner && <th>{t("pay_by")}</th>}<th>{t("status")}</th><th>{t("created_at")}</th><th /></tr>
							</thead>
							<tbody>
								{data.items.map((p) => (
									<tr key={p.id} className={cx(p.status === "REVIEW" && "bg-warning/5", p.error && "bg-danger/5")}>
										<td>
											<div className="font-medium">{p.kind === "TOPUP" ? t("pay_kind_TOPUP") : p.order?.planSnapshot?.name || t("pay_kind_ORDER")}</div>
											{p.order && (
												<div className="text-xs text-muted">
													{p.order.customerName || p.order.customerTelegramId || p.order.token.slice(0, 8)}
													<a className="ms-1 inline-flex text-cyan" href={`/shop/o/${p.order.token}`} target="_blank" rel="noreferrer" title={t("ord_open")}><ExternalLink className="h-3.5 w-3.5" /></a>
												</div>
											)}
										</td>
										<td><Badge tone="cyan">{t(`pay_m_${p.method}` as never)}</Badge></td>
										<td className="num">
											{formatNumber(p.amount, locale)}
											{p.amountUsdt ? <div className="text-xs text-muted">{p.amountUsdt} USDT</div> : null}
										</td>
										<td className="max-w-[240px] space-y-0.5 text-xs">
											{p.txid && (
												<div className="flex items-center gap-1">
													<a className="mono truncate text-cyan" title={p.txid} href={tronTxUrl(p.txid)} target="_blank" rel="noreferrer">{p.txid.slice(0, 10)}…{p.txid.slice(-6)}</a>
													<CopyBtn value={p.txid} />
												</div>
											)}
											{p.receiptRef && <div className="mono truncate">{t("pay_ref")}: {p.receiptRef}</div>}
											{p.cardPan && <div className="mono">{t("pay_card_pan")}: {p.cardPan}</div>}
											{p.refId && <div className="mono">RefID: {p.refId}</div>}
											{p.receiptFile && (
												<button type="button" className="inline-flex items-center gap-1 text-cyan" onClick={() => setReceipt(p)}>
													<FileImage className="h-3.5 w-3.5" /> {t("pay_receipt_file")}
												</button>
											)}
											{p.reviewNote && <div className="text-muted">{p.reviewNote}</div>}
											{p.error && <div className="text-danger">{p.error}</div>}
										</td>
										{isOwner && <td className="text-muted">@{p.admin.username}</td>}
										<td><Badge tone={PAY_TONE[p.status] ?? "muted"}>{t(`pay_st_${p.status}` as never)}</Badge></td>
										<td className="text-muted">{formatDate(p.createdAt, locale, true)}</td>
										<td className="text-end">
											{(p.status === "REVIEW" || p.status === "PENDING") && (
												<div className="flex justify-end gap-1">
													<Button type="button" size="sm" variant="primary" loading={busy === p.id} onClick={() => confirmPay(p)}><CheckCircle2 className="h-4 w-4" /> {t("pay_confirm")}</Button>
													<Button type="button" size="sm" variant="danger" onClick={() => setReject(p)}><XCircle className="h-4 w-4" /></Button>
												</div>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>

			<Modal
				open={!!reject}
				onClose={() => setReject(null)}
				title={t("pay_reject_title")}
				subtitle={reject ? `${t("ord_amount")}: ${formatNumber(reject.amount, locale)} ${t("currency_irt")}` : undefined}
				footer={
					<>
						<Button type="button" onClick={() => setReject(null)}>{t("cancel")}</Button>
						<Button type="button" variant="danger" loading={!!busy} onClick={doReject}>{t("pay_reject")}</Button>
					</>
				}
			>
				<Field label={t("pay_reject_note")} hint={t("pay_reject_hint")}><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
			</Modal>

			<Modal
				open={!!receipt}
				onClose={() => setReceipt(null)}
				title={t("pay_receipt_file")}
				subtitle={receipt ? `${t(`pay_m_${receipt.method}` as never)} · ${formatNumber(receipt.amount, locale)} ${t("currency_irt")}` : undefined}
				size="lg"
				footer={
					receipt ? (
						<>
							<a className="btn btn-sm me-auto" href={`/api/files/receipt/${receipt.id}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> {t("ord_open")}</a>
							{(receipt.status === "REVIEW" || receipt.status === "PENDING") && (
								<>
									<Button
										type="button"
										variant="danger"
										onClick={() => {
											setReject(receipt)
											setReceipt(null)
										}}
									>
										<XCircle className="h-4 w-4" /> {t("pay_reject")}
									</Button>
									<Button
										type="button"
										variant="primary"
										loading={busy === receipt.id}
										onClick={async () => {
											const target = receipt
											setReceipt(null)
											await confirmPay(target)
										}}
									>
										<CheckCircle2 className="h-4 w-4" /> {t("pay_confirm")}
									</Button>
								</>
							)}
						</>
					) : undefined
				}
			>
				{receipt && (
					<div className="space-y-3">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={`/api/files/receipt/${receipt.id}`} alt={t("pay_receipt_file")} className="mx-auto max-h-[60vh] w-auto rounded-2xl border" />
						<div className="flex flex-wrap gap-1.5 text-xs">
							{receipt.receiptRef && <Badge tone="violet">{t("pay_ref")}: {receipt.receiptRef}</Badge>}
							{receipt.cardPan && <Badge tone="cyan">{t("pay_card_pan")}: {receipt.cardPan}</Badge>}
							<Badge tone={PAY_TONE[receipt.status] ?? "muted"}>{t(`pay_st_${receipt.status}` as never)}</Badge>
							<Badge tone="muted">{formatDate(receipt.createdAt, locale, true)}</Badge>
						</div>
					</div>
				)}
			</Modal>
		</div>
	)
}
