"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Clock, Coins, Copy, CreditCard, ExternalLink, Gift, Globe, KeyRound, LifeBuoy, Loader2, LogIn, LogOut, Package, Plus, RefreshCw, Send, ShieldCheck, User, Wallet, XCircle } from "lucide-react"
import { QR } from "@/components/QR"
import { api, copyText } from "@/lib/client"
import { formatBytes, formatDate, formatNumber } from "@/lib/format"
import { AuthModal, shopLogout, useShopAccount } from "../ShopAccount"
import { METHOD_META, ORDER_STATUS_FA, WALLET_KIND_FA, currencyLabel, type CustomerMe, type Method, type PublicStore } from "../types"

/**
 * Customer dashboard of one storefront: wallet balance, top-ups, orders,
 * delivered services and the account profile.
 */

type PayNext =
	| { type: "usdt"; address: string; network: string; amountUsdt: string; rate: number; symbol?: string; networkLabel?: string; memo?: string | null; label?: string | null }
	| { type: "card"; cardNumber: string; cardHolder: string | null; cardBank: string | null }
	| { type: "redirect"; url: string }
	| { type: "review" }
	| { type: "done" }
	| { type: "none" }

type PaymentView = {
	id: string
	kind: string
	method: Method | "MANUAL"
	status: "PENDING" | "REVIEW" | "CONFIRMED" | "REJECTED" | "EXPIRED"
	amount: string
	amountUsdt: string | null
	expiresAt: string | null
	createdAt: string
	error: string | null
	reviewNote: string | null
	next: PayNext
}

type TabKey = "wallet" | "orders" | "services" | "profile"

const TABS: { key: TabKey; label: string; icon: typeof Wallet }[] = [
	{ key: "wallet", label: "کیف پول", icon: Wallet },
	{ key: "orders", label: "سفارش‌ها", icon: Package },
	{ key: "services", label: "سرویس‌های من", icon: Globe },
	{ key: "profile", label: "اطلاعات حساب", icon: User },
]

const QUICK = [100000, 200000, 500000, 1000000]
const fa = (n: string | number) => formatNumber(Number(n), "fa")

export function AccountView({ store }: { store: PublicStore }) {
	const accounts = store.accounts
	const currency = currencyLabel(store.currency)
	const { me, loaded, reload } = useShopAccount(accounts.enabled)
	const [authOpen, setAuthOpen] = useState(false)
	const [tab, setTab] = useState<TabKey>(accounts.walletEnabled ? "wallet" : "orders")
	const [pay, setPay] = useState<PaymentView | null>(null)
	const [openTopups, setOpenTopups] = useState<PaymentView[]>([])
	const [flash, setFlash] = useState<string | null>(null)

	const loadOpen = useCallback(async () => {
		if (!accounts.walletEnabled) return
		try {
			const r = await api<{ items: PaymentView[] }>("/api/shop/me/payments")
			setOpenTopups(r.items ?? [])
		} catch {
			/* no session — the dashboard shows the login panel */
		}
	}, [accounts.walletEnabled])

	useEffect(() => {
		if (me) void loadOpen()
	}, [me, loadOpen])

	const payId = pay ? pay.id : null
	const payLive = pay ? pay.status === "PENDING" || pay.status === "REVIEW" : false

	// a card/crypto top-up is confirmed outside this page, so poll while it is open
	useEffect(() => {
		if (!payId || !payLive) return
		const timer = setInterval(() => {
			api<PaymentView>("/api/shop/me/payments/" + payId)
				.then(async (r) => {
					setPay(r)
					if (r.status === "CONFIRMED") {
						setFlash("پرداخت تأیید شد و کیف پول شما شارژ شد.")
						await reload()
						await loadOpen()
					}
				})
				.catch(() => undefined)
		}, 7000)
		return () => clearInterval(timer)
	}, [payId, payLive, reload, loadOpen])

	const refreshAll = useCallback(async () => {
		await reload()
		await loadOpen()
	}, [reload, loadOpen])

	async function logout() {
		await shopLogout()
		window.location.href = "/shop/" + store.slug
	}

	const style = { "--brand-primary": store.brand.primaryColor, "--brand-accent": store.brand.accentColor } as React.CSSProperties

	return (
		<div className="relative min-h-dvh px-4 py-8" style={style} dir="rtl">
			<div className="aurora" />
			<div className="mx-auto w-full max-w-3xl space-y-5">
				<header className="fade-up flex items-center justify-between gap-2">
					<Link href={"/shop/" + store.slug} className="flex items-center gap-2 text-sm text-muted hover:text-fg">
						<ArrowRight className="h-4 w-4" />
						<span className="font-semibold text-fg">{store.title}</span>
					</Link>
					<div className="flex items-center gap-1">
						<button type="button" className="btn btn-ghost btn-sm" onClick={refreshAll} title="به‌روزرسانی">
							<RefreshCw className="h-4 w-4" />
						</button>
						{me ? (
							<button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
								<LogOut className="h-4 w-4" /> خروج
							</button>
						) : null}
					</div>
				</header>

				{flash ? <div className="fade-up rounded-xl bg-success/10 p-3 text-sm text-success">{flash}</div> : null}

				{!accounts.enabled ? (
					<div className="fade-up glass space-y-3 p-6 text-center">
						<ShieldCheck className="mx-auto h-10 w-10 text-muted" />
						<div className="font-semibold">حساب کاربری در این فروشگاه فعال نیست</div>
						<Link href={"/shop/" + store.slug} className="btn btn-primary">
							بازگشت به فروشگاه
						</Link>
					</div>
				) : !loaded ? (
					<div className="glass flex items-center justify-center p-10">
						<Loader2 className="h-6 w-6 spin text-muted" />
					</div>
				) : !me ? (
					<div className="fade-up glass space-y-3 p-6 text-center">
						<Wallet className="mx-auto h-10 w-10 text-cyan" />
						<div className="font-semibold">برای دیدن سفارش‌ها، سرویس‌ها و کیف پول وارد شوید</div>
						<button type="button" className="btn btn-primary" onClick={() => setAuthOpen(true)}>
							<LogIn className="h-4 w-4" /> ورود / ثبت‌نام
						</button>
					</div>
				) : (
					<>
						{accounts.walletEnabled ? <BalanceCard me={me} currency={currency} bonusPct={accounts.topupBonusPct} /> : <HelloCard me={me} />}

						<nav className="fade-up glass-2 grid grid-cols-2 gap-1 rounded-2xl p-1 text-xs sm:grid-cols-4">
							{TABS.filter((t) => t.key !== "wallet" || accounts.walletEnabled).map((t) => (
								<button
									key={t.key}
									type="button"
									onClick={() => setTab(t.key)}
									className={"flex items-center justify-center gap-1 rounded-xl p-2 transition " + (tab === t.key ? "bg-violet/25 font-semibold" : "hover:bg-white/5")}
								>
									<t.icon className="h-4 w-4" /> {t.label}
								</button>
							))}
						</nav>

						{tab === "wallet" && accounts.walletEnabled ? (
							<section className="space-y-4">
								{pay ? (
									<PaymentPanel payment={pay} currency={currency} onUpdated={setPay} onClose={() => setPay(null)} />
								) : (
									<TopupForm
										store={store}
										currency={currency}
										onStarted={(p) => {
											setFlash(null)
											setPay(p)
										}}
									/>
								)}

								{!pay && openTopups.length ? (
									<div className="glass space-y-2 p-4">
										<div className="flex items-center gap-2 text-sm font-semibold">
											<Clock className="h-4 w-4 text-warning" /> شارژهای در جریان
										</div>
										{openTopups.map((t) => (
											<button key={t.id} type="button" onClick={() => setPay(t)} className="glass-2 flex w-full items-center justify-between gap-2 rounded-xl p-3 text-start text-xs transition hover:bg-white/5">
												<span className="num">
													{fa(t.amount)} {currency}
												</span>
												<span className="text-muted">{formatDate(t.createdAt, "fa", true)}</span>
												<span className={t.status === "REVIEW" ? "text-warning" : "text-cyan"}>{t.status === "REVIEW" ? "در بررسی" : "در انتظار پرداخت"}</span>
											</button>
										))}
									</div>
								) : null}

								<WalletLedger me={me} currency={currency} />
							</section>
						) : null}

						{tab === "orders" ? <OrdersList me={me} currency={currency} /> : null}
						{tab === "services" ? <ServicesList me={me} /> : null}
						{tab === "profile" ? <ProfileForms store={store} me={me} onSaved={refreshAll} onFlash={setFlash} /> : null}
					</>
				)}

				<footer className="fade-up flex flex-wrap items-center justify-center gap-3 pb-6 text-xs text-muted">
					{store.supportUrl ? (
						<a className="btn btn-ghost btn-sm" href={store.supportUrl} target="_blank" rel="noreferrer">
							<LifeBuoy className="h-4 w-4" /> پشتیبانی
						</a>
					) : null}
					<span>
						© {new Date().getFullYear()} {store.brand.name}
					</span>
				</footer>
			</div>

			<AuthModal
				store={store}
				open={authOpen}
				mode="login"
				onClose={() => setAuthOpen(false)}
				onDone={async () => {
					setAuthOpen(false)
					await refreshAll()
				}}
			/>
		</div>
	)
}

function BalanceCard({ me, currency, bonusPct }: { me: CustomerMe; currency: string; bonusPct: number }) {
	const c = me.customer
	return (
		<section className="fade-up glass neon-ring space-y-1 p-5">
			<div className="text-xs text-muted">موجودی کیف پول</div>
			<div className="num neon-text text-3xl font-black">
				{fa(c.credit)} <span className="text-base font-normal text-muted">{currency}</span>
			</div>
			<div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted">
				<span>{c.name || c.email || c.phone || "حساب من"}</span>
				{bonusPct > 0 ? (
					<span className="text-success">
						<Gift className="me-1 inline h-3 w-3" /> {fa(bonusPct)}٪ هدیه روی هر شارژ
					</span>
				) : null}
			</div>
		</section>
	)
}

function HelloCard({ me }: { me: CustomerMe }) {
	const c = me.customer
	return (
		<section className="fade-up glass p-5">
			<div className="text-xs text-muted">خوش آمدید</div>
			<div className="text-lg font-bold">{c.name || c.email || c.phone || "حساب من"}</div>
		</section>
	)
}

/** Starts a wallet top-up; the seller's enabled gateways are reused. */
function TopupForm({ store, currency, onStarted }: { store: PublicStore; currency: string; onStarted: (p: PaymentView) => void }) {
	const methods = store.methods.filter((m) => m !== "WALLET")
	const min = Math.max(1000, Number(store.accounts.minTopup || 0))
	const bonusPct = store.accounts.topupBonusPct
	const [amount, setAmount] = useState(min)
	const [method, setMethod] = useState<Method>(methods[0] ?? "CARD")
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const bonus = bonusPct > 0 ? Math.floor((amount * bonusPct) / 100) : 0
	const quick = QUICK.filter((q) => q >= min)

	async function submit(e: FormEvent) {
		e.preventDefault()
		setError(null)
		if (amount < min) {
			setError("حداقل مبلغ شارژ " + fa(min) + " " + currency + " است")
			return
		}
		setBusy(true)
		try {
			const r = await api<{ paymentId: string; next: PayNext }>("/api/shop/me/topup", { method: "POST", json: { amount, method } })
			if (r.next.type === "redirect") {
				window.location.href = r.next.url
				return
			}
			onStarted(await api<PaymentView>("/api/shop/me/payments/" + r.paymentId))
		} catch (err) {
			setError(err instanceof Error ? err.message : "شروع شارژ ناموفق بود")
		} finally {
			setBusy(false)
		}
	}

	return (
		<form onSubmit={submit} className="fade-up glass space-y-4 p-5">
			<div className="flex items-center gap-2 text-sm font-semibold">
				<Plus className="h-4 w-4 text-cyan" /> شارژ کیف پول
			</div>

			{methods.length === 0 ? <p className="text-xs text-danger">فروشنده هنوز هیچ روش پرداختی را فعال نکرده است.</p> : null}

			<label className="label">
				مبلغ ({currency})
				<input className="input num mt-1" dir="ltr" inputMode="numeric" value={amount} onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)} />
			</label>

			<div className="flex flex-wrap gap-2">
				{quick.map((q) => (
					<button key={q} type="button" className="btn btn-sm num" onClick={() => setAmount(q)}>
						{fa(q)}
					</button>
				))}
			</div>

			<p className="text-[11px] text-muted">
				حداقل مبلغ شارژ: <span className="num">{fa(min)}</span> {currency}
			</p>
			{bonus > 0 ? (
				<p className="text-[11px] text-success">
					<Gift className="me-1 inline h-3 w-3" /> با این پرداخت <span className="num">{fa(amount + bonus)}</span> {currency} به حساب شما اضافه می‌شود.
				</p>
			) : null}

			<div className="grid gap-2 sm:grid-cols-3">
				{methods.map((m) => {
					const meta = METHOD_META[m]
					return (
						<button type="button" key={m} onClick={() => setMethod(m)} className={"glass-2 flex items-center gap-3 rounded-xl p-3 text-start transition " + (method === m ? "neon-ring bg-violet/20" : "hover:bg-white/5")}>
							<meta.icon className="h-5 w-5 shrink-0 text-cyan" />
							<div>
								<div className="text-sm font-medium">{meta.label}</div>
								<div className="text-[11px] text-muted">{meta.hint}</div>
							</div>
						</button>
					)
				})}
			</div>

			{error ? <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

			<button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy || methods.length === 0 || amount < min}>
				{busy ? <Loader2 className="h-4 w-4 spin" /> : <Wallet className="h-4 w-4" />} ادامه و پرداخت
			</button>
		</form>
	)
}

/** Payment instructions + proof form of one open top-up. */
function PaymentPanel({ payment, currency, onUpdated, onClose }: { payment: PaymentView; currency: string; onUpdated: (p: PaymentView) => void; onClose: () => void }) {
	const [txid, setTxid] = useState("")
	const [receiptRef, setReceiptRef] = useState("")
	const [cardPan, setCardPan] = useState("")
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [copied, setCopied] = useState<string | null>(null)

	const copy = async (key: string, value: string) => {
		if (await copyText(value)) {
			setCopied(key)
			setTimeout(() => setCopied(null), 1500)
		}
	}

	async function sendProof(e: FormEvent) {
		e.preventDefault()
		setError(null)
		setBusy(true)
		try {
			const saved = await api<PaymentView>("/api/shop/me/payments/" + payment.id + "/proof", {
				method: "POST",
				json: { txid: txid.trim() || null, receiptRef: receiptRef.trim() || null, cardPan: cardPan.trim() || null },
			})
			onUpdated(saved)
		} catch (err) {
			setError(err instanceof Error ? err.message : "ارسال اطلاعات پرداخت ناموفق بود")
		} finally {
			setBusy(false)
		}
	}

	const next = payment.next
	const waiting = payment.status === "PENDING"

	return (
		<div className="fade-up glass space-y-4 p-5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2 text-sm font-semibold">
					{payment.status === "CONFIRMED" ? (
						<CheckCircle2 className="h-4 w-4 text-success" />
					) : payment.status === "REJECTED" || payment.status === "EXPIRED" ? (
						<XCircle className="h-4 w-4 text-danger" />
					) : payment.status === "REVIEW" ? (
						<ShieldCheck className="h-4 w-4 text-warning" />
					) : (
						<Clock className="h-4 w-4 text-cyan" />
					)}
					شارژ <span className="num">{fa(payment.amount)}</span> {currency}
				</div>
				<button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
					بستن
				</button>
			</div>

			{payment.expiresAt && waiting ? (
				<p className="text-[11px] text-muted">مهلت پرداخت: {formatDate(payment.expiresAt, "fa", true)}</p>
			) : null}

			{payment.error ? (
				<p className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning">
					<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
					<span>{payment.error}</span>
				</p>
			) : null}
			{payment.status === "CONFIRMED" ? <p className="rounded-xl bg-success/10 p-3 text-sm text-success">پرداخت تأیید شد و موجودی کیف پول شما به‌روز است.</p> : null}
			{payment.status === "REVIEW" ? <p className="rounded-xl bg-warning/10 p-3 text-xs text-warning">اطلاعات پرداخت ثبت شد و در صف بررسی است؛ این صفحه خودکار به‌روز می‌شود.</p> : null}
			{payment.status === "REJECTED" ? <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">این پرداخت رد شد{payment.reviewNote ? ": " + payment.reviewNote : "."}</p> : null}
			{payment.status === "EXPIRED" ? <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">مهلت این پرداخت تمام شد؛ یک شارژ جدید ثبت کنید.</p> : null}

			{waiting && next.type === "usdt" ? (
				<form onSubmit={sendProof} className="space-y-3">
					<div className="flex items-center gap-2 text-xs text-muted">
						<Coins className="h-4 w-4" /> پرداخت ارز دیجیتال
					</div>
					<div className="glass-2 space-y-2 rounded-xl p-4 text-center">
						<div className="text-xs text-muted">
							مبلغ{" "}
							<b className="num neon-text">
								{next.amountUsdt} {next.symbol ?? "USDT"}
							</b>{" "}
							را در شبکهٔ <b>{next.networkLabel ?? next.network}</b> ارسال کنید
						</div>
						<QR value={next.address} size={150} />
						<div className="flex items-center gap-2">
							<input readOnly dir="ltr" value={next.address} className="input mono flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
							<button type="button" className="btn" onClick={() => copy("addr", next.address)}>
								{copied === "addr" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
							</button>
						</div>
						{next.memo ? (
							<div className="space-y-1">
								<div className="text-[11px] text-warning">این شبکه ممو/تگ لازم دارد — بدون آن تراکنش گم می‌شود</div>
								<div className="flex items-center gap-2">
									<input readOnly dir="ltr" value={next.memo} className="input mono flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
									<button type="button" className="btn" onClick={() => copy("memo", String(next.memo ?? ""))}>
										{copied === "memo" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
									</button>
								</div>
							</div>
						) : null}
						<p className="text-[11px] text-muted">
							نرخ: <span className="num">{fa(next.rate)}</span> {currency} برای هر {next.symbol ?? "USDT"} · مبلغ را دقیق و فقط در همین شبکه واریز کنید.
						</p>
					</div>
					<label className="label">
						هش تراکنش (TXID)
						<input className="input mono mt-1" dir="ltr" required minLength={20} value={txid} onChange={(e) => setTxid(e.target.value.trim())} placeholder="a1b2c3…" />
					</label>
					{error ? <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}
					<button type="submit" className="btn btn-primary w-full" disabled={busy}>
						{busy ? <Loader2 className="h-4 w-4 spin" /> : <Send className="h-4 w-4" />} پرداخت کردم
					</button>
				</form>
			) : null}

			{waiting && next.type === "card" ? (
				<form onSubmit={sendProof} className="space-y-3">
					<div className="glass-2 space-y-2 rounded-xl p-4 text-center">
						<div className="text-xs text-muted">
							مبلغ <b className="num text-fg">{fa(payment.amount)}</b> {currency} را به کارت زیر واریز کنید
						</div>
						<div className="flex items-center justify-center gap-2">
							<span dir="ltr" className="mono text-lg tracking-widest">
								{next.cardNumber.replace(/(\d{4})(?=\d)/g, "$1 ")}
							</span>
							<button type="button" className="btn btn-sm" onClick={() => copy("card", next.cardNumber)}>
								{copied === "card" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
							</button>
						</div>
						<div className="text-sm">
							{next.cardHolder}
							{next.cardBank ? " · " + next.cardBank : ""}
						</div>
					</div>
					<label className="label">
						شماره پیگیری / مرجع
						<input className="input mono mt-1" dir="ltr" required value={receiptRef} onChange={(e) => setReceiptRef(e.target.value)} placeholder="123456" />
					</label>
					<label className="label">
						۴ رقم آخر کارت واریزکننده (اختیاری)
						<input className="input mono mt-1" dir="ltr" inputMode="numeric" maxLength={4} value={cardPan} onChange={(e) => setCardPan(e.target.value.replace(/\D/g, ""))} />
					</label>
					{error ? <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}
					<button type="submit" className="btn btn-primary w-full" disabled={busy}>
						{busy ? <Loader2 className="h-4 w-4 spin" /> : <Send className="h-4 w-4" />} ارسال رسید
					</button>
				</form>
			) : null}

			{waiting && next.type === "redirect" ? (
				<a className="btn btn-primary w-full py-3" href={next.url}>
					<CreditCard className="h-5 w-5" /> انتقال به درگاه پرداخت
				</a>
			) : null}
		</div>
	)
}

function WalletLedger({ me, currency }: { me: CustomerMe; currency: string }) {
	if (!me.wallet.length) return <div className="glass p-4 text-center text-xs text-muted">هنوز تراکنشی در کیف پول ثبت نشده است.</div>
	return (
		<div className="fade-up glass space-y-2 p-4">
			<div className="text-sm font-semibold">گردش کیف پول</div>
			<div>
				{me.wallet.map((t) => {
					const amount = Number(t.amount)
					return (
						<div key={t.id} className="flex items-center justify-between gap-2 border-b border-white/5 py-2 text-xs last:border-0">
							<div>
								<div className="font-medium">{WALLET_KIND_FA[t.kind]}</div>
								<div className="text-[11px] text-muted">{t.note || formatDate(t.createdAt, "fa", true)}</div>
							</div>
							<div className="text-end">
								<div className={"num " + (amount >= 0 ? "text-success" : "text-danger")}>
									{amount >= 0 ? "+" : "−"}
									{fa(Math.abs(amount))}
								</div>
								<div className="num text-[11px] text-muted">
									مانده: {fa(t.balanceAfter)} {currency}
								</div>
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}

function OrdersList({ me, currency }: { me: CustomerMe; currency: string }) {
	if (!me.orders.length) return <div className="fade-up glass p-6 text-center text-sm text-muted">هنوز سفارشی ثبت نکرده‌اید.</div>
	return (
		<div className="fade-up glass p-4">
			{me.orders.map((o) => (
				<Link key={o.token} href={"/shop/o/" + o.token} className="flex items-center justify-between gap-2 border-b border-white/5 py-3 text-sm transition last:border-0 hover:opacity-80">
					<div>
						<div className="font-medium">{o.planName || "سفارش"}</div>
						<div className="text-[11px] text-muted">
							{formatDate(o.createdAt, "fa", true)} · <span className="mono">{o.token.slice(0, 8)}</span>
						</div>
					</div>
					<div className="text-end">
						<div className="num">
							{fa(o.amount)} {currency}
						</div>
						<div className="text-[11px] text-muted">{ORDER_STATUS_FA[o.status] ?? o.status}</div>
					</div>
				</Link>
			))}
		</div>
	)
}

function ServicesList({ me }: { me: CustomerMe }) {
	if (!me.services.length) return <div className="fade-up glass p-6 text-center text-sm text-muted">سرویس فعالی روی این حساب ثبت نشده است.</div>
	return (
		<div className="fade-up glass p-4">
			{me.services.map((s) => {
				const limit = Number(s.trafficLimit)
				const used = Number(s.used)
				return (
					<div key={s.subToken} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 py-3 text-sm last:border-0">
						<div>
							<div className="font-medium">{s.name}</div>
							<div className="text-[11px] text-muted">
								{limit > 0 ? formatBytes(used) + " از " + formatBytes(limit) : formatBytes(used) + " مصرف (نامحدود)"} · {s.expiresAt ? "انقضا " + formatDate(s.expiresAt, "fa") : "بدون انقضا"}
							</div>
						</div>
						<a className="btn btn-sm" href={"/s/" + s.subToken} target="_blank" rel="noreferrer">
							<ExternalLink className="h-4 w-4" /> صفحه اشتراک
						</a>
					</div>
				)
			})}
		</div>
	)
}

function ProfileForms({ store, me, onSaved, onFlash }: { store: PublicStore; me: CustomerMe; onSaved: () => Promise<void>; onFlash: (m: string | null) => void }) {
	const c = me.customer
	const [form, setForm] = useState({ name: c.name ?? "", phone: c.phone ?? "", telegramId: c.telegramId ?? "" })
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [pw, setPw] = useState({ current: "", next: "" })
	const [pwBusy, setPwBusy] = useState(false)
	const [pwError, setPwError] = useState<string | null>(null)

	async function saveProfile(e: FormEvent) {
		e.preventDefault()
		setError(null)
		setBusy(true)
		try {
			await api("/api/shop/me", { method: "PATCH", json: { name: form.name || null, phone: form.phone || null, telegramId: form.telegramId || null } })
			onFlash("اطلاعات حساب ذخیره شد.")
			await onSaved()
		} catch (err) {
			setError(err instanceof Error ? err.message : "ذخیره اطلاعات ناموفق بود")
		} finally {
			setBusy(false)
		}
	}

	async function changePassword(e: FormEvent) {
		e.preventDefault()
		setPwError(null)
		setPwBusy(true)
		try {
			await api("/api/shop/me/password", { method: "POST", json: pw })
			setPw({ current: "", next: "" })
			onFlash("رمز عبور تغییر کرد؛ برای ادامه دوباره وارد شوید.")
			await onSaved()
		} catch (err) {
			setPwError(err instanceof Error ? err.message : "تغییر رمز عبور ناموفق بود")
		} finally {
			setPwBusy(false)
		}
	}

	return (
		<div className="space-y-4">
			<form onSubmit={saveProfile} className="fade-up glass space-y-4 p-5">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<User className="h-4 w-4 text-cyan" /> اطلاعات حساب
				</div>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="label">
						نام
						<input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
					</label>
					<label className="label">
						ایمیل (قابل تغییر نیست)
						<input className="input mono mt-1" dir="ltr" readOnly value={c.email ?? "—"} />
					</label>
					<label className="label">
						شماره موبایل {store.requirePhone ? "*" : ""}
						<input className="input mono mt-1" dir="ltr" inputMode="tel" required={store.requirePhone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
					</label>
					<label className="label">
						شناسه عددی تلگرام {store.requireTelegram ? "*" : ""}
						<input className="input mono mt-1" dir="ltr" inputMode="numeric" required={store.requireTelegram} value={form.telegramId} onChange={(e) => setForm({ ...form, telegramId: e.target.value.replace(/\D/g, "") })} />
					</label>
				</div>
				<p className="text-[11px] text-muted">عضویت: {formatDate(c.createdAt, "fa")}</p>
				{error ? <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}
				<button type="submit" className="btn btn-primary" disabled={busy}>
					{busy ? <Loader2 className="h-4 w-4 spin" /> : <Check className="h-4 w-4" />} ذخیره
				</button>
			</form>

			<form onSubmit={changePassword} className="fade-up glass space-y-4 p-5">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<KeyRound className="h-4 w-4 text-cyan" /> تغییر رمز عبور
				</div>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="label">
						رمز فعلی
						<input className="input mono mt-1" dir="ltr" type="password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
					</label>
					<label className="label">
						رمز جدید
						<input className="input mono mt-1" dir="ltr" type="password" required minLength={6} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="حداقل ۶ کاراکتر" />
					</label>
				</div>
				<p className="text-[11px] text-muted">با تغییر رمز، همهٔ دستگاه‌ها از حساب خارج می‌شوند.</p>
				{pwError ? <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{pwError}</p> : null}
				<button type="submit" className="btn" disabled={pwBusy}>
					{pwBusy ? <Loader2 className="h-4 w-4 spin" /> : <KeyRound className="h-4 w-4" />} تغییر رمز
				</button>
			</form>
		</div>
	)
}
