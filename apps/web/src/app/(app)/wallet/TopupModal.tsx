"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Check, ExternalLink } from "lucide-react"
import { api } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { QR } from "@/components/QR"
import { Button, Empty, Field, Input, Modal, cx, useToast } from "@/components/ui"
import { CopyBtn } from "@/components/bits"
import { AMOUNT_PRESETS, tr, type Method, type Next } from "./types"

export function TopupModal({ open, onClose, methods, onDone }: { open: boolean; onClose: () => void; methods: Method[]; onDone: () => void }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [amount, setAmount] = useState(500_000)
	const [method, setMethod] = useState<Method>(methods[0] ?? "CARD")
	const [busy, setBusy] = useState(false)
	const [payment, setPayment] = useState<{ id: string } | null>(null)
	const [next, setNext] = useState<Next | null>(null)
	const [proof, setProof] = useState({ txid: "", receiptRef: "", cardPan: "" })

	useEffect(() => {
		if (open) {
			setPayment(null)
			setNext(null)
			setProof({ txid: "", receiptRef: "", cardPan: "" })
			setMethod(methods[0] ?? "CARD")
		}
	}, [open, methods])

	async function start(e: FormEvent) {
		e.preventDefault()
		setBusy(true)
		try {
			const r = await api<{ payment: { id: string }; next: Next }>("/api/wallet/topup", { method: "POST", json: { amount, method } })
			setPayment(r.payment)
			setNext(r.next)
			if (r.next.type === "redirect") window.location.href = r.next.url
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setBusy(false)
		}
	}

	async function sendProof(e: FormEvent) {
		e.preventDefault()
		if (!payment) return
		setBusy(true)
		try {
			const r = await api<{ next: Next }>(`/api/wallet/topup/${payment.id}/proof`, { method: "POST", json: { txid: proof.txid || null, receiptRef: proof.receiptRef || null, cardPan: proof.cardPan || null } })
			setNext(r.next)
			toast.ok(r.next.type === "done" ? t("wal_topup_done") : t("wal_topup_review"))
			onDone()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setBusy(false)
		}
	}

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={t("wal_topup")}
			subtitle={next ? `${formatNumber(amount, locale)} ${t("currency_irt")}` : L("مبلغ و روش پرداخت را انتخاب کنید", "Pick an amount and a payment method")}
			size="lg"
		>
			{!methods.length ? (
				<Empty text={t("wal_no_methods")} />
			) : !next ? (
				<form onSubmit={start} className="space-y-4">
					<Field label={`${t("ord_amount")} (${t("currency_irt")})`}>
						<Input type="number" min={1000} step={1000} required value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
						<div className="mt-2 flex flex-wrap gap-1.5">
							{AMOUNT_PRESETS.map((a) => (
								<button type="button" key={a} onClick={() => setAmount(a)} className={cx("chip", amount === a && "chip-on")}>{formatNumber(a, locale)}</button>
							))}
						</div>
					</Field>
					<Field label={t("pay_method")}>
						<div className="grid gap-2 sm:grid-cols-3">
							{methods.map((m) => (
								<button type="button" key={m} onClick={() => setMethod(m)} className={cx("pick", method === m && "pick-on")}>
									<span className="text-sm font-medium">{t(`pay_m_${m}` as never)}</span>
								</button>
							))}
						</div>
					</Field>
					<Button type="submit" variant="primary" loading={busy} className="w-full">{t("wal_topup_start")}</Button>
				</form>
			) : next.type === "usdt" ? (
				<form onSubmit={sendProof} className="space-y-4">
					<div className="tile flex flex-col items-center gap-3 text-center">
						<QR value={next.address} size={150} />
						<div className="text-sm">{t("shop_usdt_send")} <b className="num neon-text">{next.amountUsdt} USDT</b> <span className="text-muted">({next.network})</span></div>
						<div className="flex w-full items-center gap-2">
							<input readOnly dir="ltr" value={next.address} className="input mono flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
							<CopyBtn value={next.address} />
						</div>
						<p className="text-xs text-muted">{t("shop_usdt_rate")}: {formatNumber(next.rate, locale)} {t("currency_irt")}</p>
					</div>
					<Field label={t("shop_txid")} hint={t("shop_txid_hint")}><Input dir="ltr" className="mono" required value={proof.txid} onChange={(e) => setProof({ ...proof, txid: e.target.value.trim() })} /></Field>
					<Button type="submit" variant="primary" loading={busy} className="w-full">{t("shop_submit_proof")}</Button>
				</form>
			) : next.type === "card" ? (
				<form onSubmit={sendProof} className="space-y-4">
					<div className="tile space-y-2 text-center">
						<div className="text-xs text-muted">{t("shop_card_transfer")} <b className="num text-fg">{formatNumber(amount, locale)}</b> {t("currency_irt")}</div>
						<div className="flex items-center justify-center gap-2">
							<span dir="ltr" className="mono text-lg tracking-widest">{next.cardNumber.replace(/(\d{4})(?=\d)/g, "$1 ")}</span>
							<CopyBtn value={next.cardNumber} />
						</div>
						<div className="text-sm">{next.cardHolder}{next.cardBank ? ` · ${next.cardBank}` : ""}</div>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<Field label={t("shop_receipt_ref")} hint={t("shop_receipt_ref_hint")}><Input dir="ltr" className="mono" required value={proof.receiptRef} onChange={(e) => setProof({ ...proof, receiptRef: e.target.value.trim() })} /></Field>
						<Field label={t("shop_card_pan")}><Input dir="ltr" className="mono" inputMode="numeric" value={proof.cardPan} onChange={(e) => setProof({ ...proof, cardPan: e.target.value.trim() })} placeholder="6037" /></Field>
					</div>
					<Button type="submit" variant="primary" loading={busy} className="w-full">{t("shop_submit_proof")}</Button>
				</form>
			) : next.type === "redirect" ? (
				<div className="space-y-3 text-center">
					<p className="text-sm text-muted">{t("shop_redirecting")}</p>
					<a className="btn btn-primary" href={next.url}><ExternalLink className="h-4 w-4" /> {t("shop_pay_gateway")}</a>
				</div>
			) : (
				<div className="space-y-3 text-center">
					<div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success"><Check className="h-7 w-7" /></div>
					<p className="text-sm">{next.type === "done" ? t("wal_topup_done") : t("wal_topup_review")}</p>
					<Button type="button" onClick={onClose}>{t("close")}</Button>
				</div>
			)}
		</Modal>
	)
}
