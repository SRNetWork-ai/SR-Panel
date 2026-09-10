"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ArrowDownCircle, ArrowUpCircle, Check, Coins, Copy, ExternalLink, Landmark, PlusCircle, RefreshCw, Settings2, Users, Wallet } from "lucide-react"
import { api, copyText } from "@/lib/client"
import { formatDate, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { QR } from "@/components/QR"
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Switch, Textarea, cx, useToast } from "@/components/ui"

type Method = "USDT" | "CARD" | "ZARINPAL"
type Tx = { id: string; kind: "TOPUP" | "PURCHASE" | "REFUND" | "ADJUST"; amount: number; balanceAfter: number; refType: string | null; refId: string | null; note: string | null; createdAt: string }
type Topup = { id: string; method: Method | "WALLET" | "MANUAL"; status: "PENDING" | "REVIEW" | "CONFIRMED" | "REJECTED" | "EXPIRED"; amount: number; amountUsdt: string | null; txid: string | null; receiptRef: string | null; reviewNote: string | null; createdAt: string; expiresAt: string | null }
type Next =
	| { type: "usdt"; address: string; network: string; amountUsdt: string; rate: number }
	| { type: "card"; cardNumber: string; cardHolder: string | null; cardBank: string | null }
	| { type: "redirect"; url: string }
	| { type: "review" }
	| { type: "done" }
	| { type: "none" }
type Overview = {
	balance: number
	unit: { perGB: number; perDay: number; billingEnabled: boolean }
	recent: Tx[]
	pendingTopups: number
	spent30d: number
	topupMethods: Method[]
	isOwner: boolean
}
type Pricing = { billingEnabled: boolean; pricePerGB: number; pricePerDay: number; chargeOnRenew: boolean; creditLimit: number }
type Reseller = { id: string; username: string; displayName: string | null; isActive: boolean; balance: number; pricePerGB: number | null; pricePerDay: number | null; clients: number; spent30d: number }

const KIND_TONE: Record<Tx["kind"], "success" | "warning" | "danger" | "muted" | "violet" | "cyan"> = { TOPUP: "success", PURCHASE: "violet", REFUND: "cyan", ADJUST: "warning" }
const PAY_TONE: Record<string, "success" | "warning" | "danger" | "muted" | "violet" | "cyan"> = { PENDING: "muted", REVIEW: "warning", CONFIRMED: "success", REJECTED: "danger", EXPIRED: "muted" }

/* ---------- top-up flow ---------- */
function TopupModal({ open, onClose, methods, onDone }: { open: boolean; onClose: () => void; methods: Method[]; onDone: () => void }) {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const [amount, setAmount] = useState(500_000)
	const [method, setMethod] = useState<Method>(methods[0] ?? "CARD")
	const [busy, setBusy] = useState(false)
	const [payment, setPayment] = useState<{ id: string } | null>(null)
	const [next, setNext] = useState<Next | null>(null)
	const [proof, setProof] = useState({ txid: "", receiptRef: "", cardPan: "" })
	const [copied, setCopied] = useState<string | null>(null)

	useEffect(() => {
		if (open) { setPayment(null); setNext(null); setProof({ txid: "", receiptRef: "", cardPan: "" }); setMethod(methods[0] ?? "CARD") }
	}, [open, methods])

	const copy = async (k: string, v: string) => { if (await copyText(v)) { setCopied(k); setTimeout(() => setCopied(null), 1500) } }

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
		<Modal open={open} onClose={onClose} title={t("wal_topup")}>
			{!methods.length ? <Empty text={t("wal_no_methods")} /> : !next ? (
				<form onSubmit={start} className="space-y-4">
					<Field label={`${t("ord_amount")} (${t("currency_irt")})`}>
						<Input type="number" min={1000} step={1000} required value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
						<div className="mt-2 flex flex-wrap gap-1.5">
							{[200_000, 500_000, 1_000_000, 2_000_000, 5_000_000].map((a) => <button type="button" key={a} onClick={() => setAmount(a)} className={cx("badge cursor-pointer", amount === a ? "bg-violet/30 text-fg neon-ring" : "text-muted hover:text-fg")}>{formatNumber(a, locale)}</button>)}
						</div>
					</Field>
					<Field label={t("pay_method")}>
						<div className="grid gap-2 sm:grid-cols-3">
							{methods.map((m) => (
								<button type="button" key={m} onClick={() => setMethod(m)} className={cx("glass-2 rounded-xl p-3 text-sm transition", method === m ? "neon-ring bg-violet/20" : "hover:bg-white/5")}>{t(`pay_m_${m}` as never)}</button>
							))}
						</div>
					</Field>
					<Button type="submit" variant="primary" loading={busy} className="w-full">{t("wal_topup_start")}</Button>
				</form>
			) : next.type === "usdt" ? (
				<form onSubmit={sendProof} className="space-y-4">
					<div className="flex flex-col items-center gap-3 text-center">
						<QR value={next.address} size={150} />
						<div className="text-sm">{t("shop_usdt_send")} <b className="num neon-text">{next.amountUsdt} USDT</b> <span className="text-muted">({next.network})</span></div>
						<div className="flex w-full items-center gap-2">
							<input readOnly dir="ltr" value={next.address} className="input mono flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
							<Button type="button" size="sm" onClick={() => copy("addr", next.address)}>{copied === "addr" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>
						</div>
						<p className="text-xs text-muted">{t("shop_usdt_rate")}: {formatNumber(next.rate, locale)} {t("currency_irt")}</p>
					</div>
					<Field label={t("shop_txid")} hint={t("shop_txid_hint")}><Input dir="ltr" className="mono" required value={proof.txid} onChange={(e) => setProof({ ...proof, txid: e.target.value.trim() })} /></Field>
					<Button type="submit" variant="primary" loading={busy} className="w-full">{t("shop_submit_proof")}</Button>
				</form>
			) : next.type === "card" ? (
				<form onSubmit={sendProof} className="space-y-4">
					<div className="glass-2 space-y-2 rounded-xl p-4 text-center">
						<div className="text-xs text-muted">{t("shop_card_transfer")} <b className="num text-fg">{formatNumber(amount, locale)}</b> {t("currency_irt")}</div>
						<div className="flex items-center justify-center gap-2">
							<span dir="ltr" className="mono text-lg tracking-widest">{next.cardNumber.replace(/(\d{4})(?=\d)/g, "$1 ")}</span>
							<Button type="button" size="sm" onClick={() => copy("card", next.cardNumber)}>{copied === "card" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>
						</div>
						<div className="text-sm">{next.cardHolder}{next.cardBank ? ` · ${next.cardBank}` : ""}</div>
					</div>
					<Field label={t("shop_receipt_ref")} hint={t("shop_receipt_ref_hint")}><Input dir="ltr" className="mono" required value={proof.receiptRef} onChange={(e) => setProof({ ...proof, receiptRef: e.target.value.trim() })} /></Field>
					<Field label={t("shop_card_pan")}><Input dir="ltr" className="mono" inputMode="numeric" value={proof.cardPan} onChange={(e) => setProof({ ...proof, cardPan: e.target.value.trim() })} placeholder="6037" /></Field>
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
					<Button onClick={onClose}>{t("close")}</Button>
				</div>
			)}
		</Modal>
	)
}

/* ---------- owner: pricing + resellers ---------- */
function OwnerPanel() {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const [pricing, setPricing] = useState<Pricing | null>(null)
	const [resellers, setResellers] = useState<Reseller[] | null>(null)
	const [saving, setSaving] = useState(false)
	const [adjust, setAdjust] = useState<Reseller | null>(null)
	const [adj, setAdj] = useState({ amount: 0, note: "" })
	const [priceEdit, setPriceEdit] = useState<Reseller | null>(null)
	const [pe, setPe] = useState({ pricePerGB: "", pricePerDay: "" })

	const load = useCallback(async () => {
		const [p, r] = await Promise.all([api<Pricing>("/api/settings/pricing"), api<{ resellers: Reseller[] }>("/api/wallet/resellers")])
		setPricing(p)
		setResellers(r.resellers)
	}, [])
	useEffect(() => {
		load().catch(() => undefined)
	}, [load])

	async function savePricing(e: FormEvent) {
		e.preventDefault()
		if (!pricing) return
		setSaving(true)
		try {
			setPricing(await api<Pricing>("/api/settings/pricing", { method: "PUT", json: pricing }))
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
	}
	async function doAdjust(e: FormEvent) {
		e.preventDefault()
		if (!adjust) return
		setSaving(true)
		try {
			await api("/api/wallet/adjust", { method: "POST", json: { adminId: adjust.id, amount: Math.trunc(adj.amount), note: adj.note || null } })
			toast.ok(t("set_saved"))
			setAdjust(null)
			setAdj({ amount: 0, note: "" })
			await load()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
	}
	async function savePrice(e: FormEvent) {
		e.preventDefault()
		if (!priceEdit) return
		setSaving(true)
		try {
			await api(`/api/wallet/resellers/${priceEdit.id}`, { method: "PATCH", json: { pricePerGB: pe.pricePerGB === "" ? null : Number(pe.pricePerGB), pricePerDay: pe.pricePerDay === "" ? null : Number(pe.pricePerDay) } })
			toast.ok(t("set_saved"))
			setPriceEdit(null)
			await load()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
	}

	if (!pricing || !resellers) return <div className="flex justify-center p-10"><Spinner /></div>
	return (
		<div className="grid gap-4 lg:grid-cols-3">
			<Card title={t("wal_pricing")} subtitle={t("wal_pricing_sub")} className="lg:col-span-1">
				<form onSubmit={savePricing} className="space-y-3">
					<Switch checked={pricing.billingEnabled} onChange={(v) => setPricing({ ...pricing, billingEnabled: v })} label={t("wal_billing_enabled")} />
					<Field label={`${t("wal_price_gb")} (${t("currency_irt")})`}><Input type="number" min={0} value={pricing.pricePerGB} onChange={(e) => setPricing({ ...pricing, pricePerGB: Number(e.target.value) })} /></Field>
					<Field label={`${t("wal_price_day")} (${t("currency_irt")})`}><Input type="number" min={0} value={pricing.pricePerDay} onChange={(e) => setPricing({ ...pricing, pricePerDay: Number(e.target.value) })} /></Field>
					<Field label={`${t("wal_credit_limit")} (${t("currency_irt")})`} hint={t("wal_credit_limit_hint")}><Input type="number" min={0} value={pricing.creditLimit} onChange={(e) => setPricing({ ...pricing, creditLimit: Number(e.target.value) })} /></Field>
					<Switch checked={pricing.chargeOnRenew} onChange={(v) => setPricing({ ...pricing, chargeOnRenew: v })} label={t("wal_charge_renew")} />
					<Button type="submit" variant="primary" loading={saving} className="w-full">{t("save")}</Button>
				</form>
			</Card>
			<Card title={t("wal_resellers")} subtitle={t("wal_resellers_sub")} className="lg:col-span-2" actions={<Button size="sm" variant="ghost" onClick={() => load()}><RefreshCw className="h-4 w-4" /></Button>}>
				{resellers.length === 0 ? <Empty text={t("wal_no_resellers")} /> : (
					<div className="table-wrap">
						<table className="table">
							<thead><tr><th>{t("username")}</th><th>{t("wal_balance")}</th><th>{t("wal_unit_prices")}</th><th>{t("wal_spent_30d")}</th><th /></tr></thead>
							<tbody>
								{resellers.map((r) => (
									<tr key={r.id}>
										<td><div className="font-medium">{r.displayName || r.username}</div><div className="text-xs text-muted">@{r.username} · {formatNumber(r.clients, locale)} {t("nav_clients")}</div></td>
										<td className={cx("num font-semibold", r.balance < 0 ? "text-danger" : "text-success")}>{formatNumber(r.balance, locale)}</td>
										<td className="num text-xs text-muted">{r.pricePerGB != null || r.pricePerDay != null ? `${formatNumber(r.pricePerGB ?? pricing.pricePerGB, locale)} / GB · ${formatNumber(r.pricePerDay ?? pricing.pricePerDay, locale)} / ${t("plan_days")}` : t("wal_default_prices")}</td>
										<td className="num">{formatNumber(r.spent30d, locale)}</td>
										<td className="text-end">
											<div className="flex justify-end gap-1">
												<Button size="sm" onClick={() => { setPriceEdit(r); setPe({ pricePerGB: r.pricePerGB?.toString() ?? "", pricePerDay: r.pricePerDay?.toString() ?? "" }) }}><Settings2 className="h-4 w-4" /></Button>
												<Button size="sm" variant="primary" onClick={() => setAdjust(r)}><PlusCircle className="h-4 w-4" /> {t("wal_adjust")}</Button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>

			<Modal open={!!adjust} onClose={() => setAdjust(null)} title={`${t("wal_adjust")} — @${adjust?.username ?? ""}`} footer={<><Button onClick={() => setAdjust(null)}>{t("cancel")}</Button><Button variant="primary" loading={saving} onClick={(e) => doAdjust(e as unknown as FormEvent)}>{t("save")}</Button></>}>
				<form onSubmit={doAdjust} className="space-y-3">
					<Field label={`${t("ord_amount")} (${t("currency_irt")})`} hint={t("wal_adjust_hint")}><Input type="number" required value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: Number(e.target.value) })} /></Field>
					<Field label={t("wal_note")}><Textarea rows={2} value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} /></Field>
					<button type="submit" className="hidden" />
				</form>
			</Modal>
			<Modal open={!!priceEdit} onClose={() => setPriceEdit(null)} title={`${t("wal_unit_prices")} — @${priceEdit?.username ?? ""}`} footer={<><Button onClick={() => setPriceEdit(null)}>{t("cancel")}</Button><Button variant="primary" loading={saving} onClick={(e) => savePrice(e as unknown as FormEvent)}>{t("save")}</Button></>}>
				<form onSubmit={savePrice} className="grid grid-cols-2 gap-3">
					<Field label={t("wal_price_gb")} hint={t("wal_price_override_hint")}><Input type="number" min={0} value={pe.pricePerGB} onChange={(e) => setPe({ ...pe, pricePerGB: e.target.value })} placeholder={String(pricing.pricePerGB)} /></Field>
					<Field label={t("wal_price_day")}><Input type="number" min={0} value={pe.pricePerDay} onChange={(e) => setPe({ ...pe, pricePerDay: e.target.value })} placeholder={String(pricing.pricePerDay)} /></Field>
					<button type="submit" className="hidden" />
				</form>
			</Modal>
		</div>
	)
}

/* ---------- root ---------- */
export function WalletClient({ initial }: { initial: Overview }) {
	const t = useT()
	const locale = useLocale()
	const [data, setData] = useState<Overview>(initial)
	const [txs, setTxs] = useState<Tx[] | null>(null)
	const [topups, setTopups] = useState<Topup[] | null>(null)
	const [open, setOpen] = useState(false)
	const [tab, setTab] = useState<"ledger" | "topups" | "owner">(initial.isOwner ? "owner" : "ledger")

	const refresh = useCallback(async () => {
		const [o, l, tp] = await Promise.all([api<Overview>("/api/wallet"), api<{ items: Tx[] }>("/api/wallet/txs?take=100"), api<{ items: Topup[] }>("/api/wallet/topup")])
		setData(o)
		setTxs(l.items)
		setTopups(tp.items)
	}, [])
	useEffect(() => {
		refresh().catch(() => undefined)
	}, [refresh])

	const tabs = [
		...(data.isOwner ? [{ id: "owner" as const, label: t("wal_tab_owner"), icon: Users }] : []),
		{ id: "ledger" as const, label: t("wal_tab_ledger"), icon: Coins },
		{ id: "topups" as const, label: t("wal_tab_topups"), icon: Landmark },
	]

	return (
		<div className="space-y-6 fade-up">
			<PageHeader title={t("wal_title")} subtitle={data.isOwner ? t("wal_sub_owner") : t("wal_sub")} actions={!data.isOwner ? <Button variant="primary" onClick={() => setOpen(true)}><PlusCircle className="h-4 w-4" /> {t("wal_topup")}</Button> : undefined} />
			{!data.isOwner && (
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<Stat label={t("wal_balance")} value={<span className={cx("num", data.balance < 0 && "text-danger")}>{formatNumber(data.balance, locale)}</span>} sub={t("currency_irt")} icon={<Wallet className="h-5 w-5" />} accent={data.balance < 0 ? "danger" : "violet"} />
					<Stat label={t("wal_spent_30d")} value={<span className="num">{formatNumber(data.spent30d, locale)}</span>} sub={t("currency_irt")} icon={<ArrowUpCircle className="h-5 w-5" />} accent="magenta" />
					<Stat label={t("wal_unit_prices")} value={data.unit.billingEnabled ? <span className="num text-base">{formatNumber(data.unit.perGB, locale)} <span className="text-xs text-muted">/GB</span> · {formatNumber(data.unit.perDay, locale)} <span className="text-xs text-muted">/{t("plan_days")}</span></span> : <span className="text-base">{t("wal_billing_off")}</span>} icon={<Coins className="h-5 w-5" />} accent="cyan" />
					<Stat label={t("wal_pending_topups")} value={<span className="num">{formatNumber(data.pendingTopups, locale)}</span>} icon={<ArrowDownCircle className="h-5 w-5" />} accent={data.pendingTopups ? "warning" : "success"} />
				</div>
			)}
			<div className="glass flex flex-wrap gap-1 rounded-2xl p-1.5">
				{tabs.map((x) => (
					<button key={x.id} type="button" onClick={() => setTab(x.id)} className={cx("flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition", tab === x.id ? "bg-violet/20 text-fg neon-ring" : "text-muted hover:text-fg")}>
						<x.icon className="h-4 w-4" /> {x.label}
					</button>
				))}
			</div>

			{tab === "owner" && data.isOwner && <OwnerPanel />}

			{tab === "ledger" && (
				<Card title={t("wal_tab_ledger")} actions={<Button size="sm" variant="ghost" onClick={() => refresh()}><RefreshCw className="h-4 w-4" /></Button>}>
					{!txs ? <div className="flex justify-center p-10"><Spinner /></div> : txs.length === 0 ? <Empty text={t("wal_ledger_empty")} /> : (
						<div className="table-wrap">
							<table className="table">
								<thead><tr><th>{t("wal_kind")}</th><th>{t("wal_note")}</th><th>{t("ord_amount")}</th><th>{t("wal_balance_after")}</th><th>{t("created_at")}</th></tr></thead>
								<tbody>
									{txs.map((x) => (
										<tr key={x.id}>
											<td><Badge tone={KIND_TONE[x.kind]}>{t(`wal_k_${x.kind}` as never)}</Badge></td>
											<td className="text-xs text-muted">{x.note || (x.refType ? `${x.refType} ${x.refId?.slice(0, 8) ?? ""}` : "—")}</td>
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
			)}

			{tab === "topups" && (
				<Card title={t("wal_tab_topups")} actions={!data.isOwner ? <Button size="sm" variant="primary" onClick={() => setOpen(true)}><PlusCircle className="h-4 w-4" /> {t("wal_topup")}</Button> : undefined}>
					{!topups ? <div className="flex justify-center p-10"><Spinner /></div> : topups.length === 0 ? <Empty text={t("wal_topups_empty")} /> : (
						<div className="table-wrap">
							<table className="table">
								<thead><tr><th>{t("pay_method")}</th><th>{t("ord_amount")}</th><th>{t("pay_proof")}</th><th>{t("status")}</th><th>{t("created_at")}</th></tr></thead>
								<tbody>
									{topups.map((p) => (
										<tr key={p.id}>
											<td><Badge tone="cyan">{t(`pay_m_${p.method}` as never)}</Badge></td>
											<td className="num">{formatNumber(p.amount, locale)}{p.amountUsdt ? <div className="text-xs text-muted">{p.amountUsdt} USDT</div> : null}</td>
											<td className="mono max-w-[200px] truncate text-xs text-muted">{p.txid || p.receiptRef || "—"}{p.reviewNote && <div className="text-danger">{p.reviewNote}</div>}</td>
											<td><Badge tone={PAY_TONE[p.status] ?? "muted"}>{t(`pay_st_${p.status}` as never)}</Badge></td>
											<td className="text-muted">{formatDate(p.createdAt, locale, true)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</Card>
			)}

			<TopupModal open={open} onClose={() => setOpen(false)} methods={data.topupMethods} onDone={() => refresh().catch(() => undefined)} />
		</div>
	)
}
