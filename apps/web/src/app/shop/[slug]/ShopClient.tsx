"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { BadgePercent, Check, ChevronRight, Clock, CreditCard, Landmark, LifeBuoy, Loader2, Send, ShieldCheck, Sparkles, Users, Wifi, Zap } from "lucide-react"
import { api } from "@/lib/client"
import { formatNumber } from "@/lib/format"

/* ---------- public DTOs ---------- */
type Method = "USDT" | "CARD" | "ZARINPAL"
export type PublicPlan = { id: string; name: string; description: string | null; badge: string | null; trafficGB: number; days: number; ipLimit: number; price: string; oldPrice: string | null }
export type PublicStore = {
	slug: string
	title: string
	description: string | null
	rules: string | null
	supportUrl: string | null
	currency: string
	brand: { name: string; tagline: string | null; logoUrl: string | null; primaryColor: string; accentColor: string; telegramUrl: string | null; supportUrl: string | null }
	methods: Method[]
	requireTelegram: boolean
	requirePhone: boolean
	usdtRate: number
	plans: PublicPlan[]
}

const METHOD_META: Record<Method, { label: string; hint: string; icon: typeof CreditCard }> = {
	USDT: { label: "تتر (USDT · TRC20)", hint: "پرداخت ارز دیجیتال با تأیید خودکار", icon: Zap },
	CARD: { label: "کارت به کارت", hint: "انتقال و ارسال رسید — تأیید دستی", icon: Landmark },
	ZARINPAL: { label: "درگاه بانکی (زرین‌پال)", hint: "پرداخت آنلاین با کارت بانکی — تحویل فوری", icon: CreditCard },
}

type TgWebApp = { initData?: string; ready?: () => void; expand?: () => void; initDataUnsafe?: { user?: { id: number; first_name?: string; last_name?: string; username?: string } } }

export function ShopClient({ store, renewToken, tgParam }: { store: PublicStore; renewToken?: string; tgParam?: string }) {
	const [plan, setPlan] = useState<PublicPlan | null>(null)
	const [method, setMethod] = useState<Method>(store.methods[0] ?? "CARD")
	const [form, setForm] = useState({ name: "", telegramId: tgParam ?? "", phone: "", email: "" })
	const [code, setCode] = useState("")
	const [disc, setDisc] = useState<{ discount: number; code: string | null; error?: string | null } | null>(null)
	const [checking, setChecking] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [tgVerified, setTgVerified] = useState(false)
	const [accepted, setAccepted] = useState(!store.rules)

	// Telegram Mini-App: verify initData server-side, prefill identity
	useEffect(() => {
		const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp
		if (!tg?.initData) return
		tg.ready?.()
		tg.expand?.()
		api<{ ok: boolean; telegramId?: string; name?: string | null }>("/api/shop/tg", { method: "POST", json: { initData: tg.initData } })
			.then((r) => { if (r.ok && r.telegramId) { setForm((f) => ({ ...f, telegramId: r.telegramId!, name: f.name || r.name || "" })); setTgVerified(true) } })
			.catch(() => undefined)
	}, [])

	const price = Number(plan?.price ?? 0)
	const discount = disc && !disc.error ? disc.discount : 0
	const total = Math.max(0, price - discount)
	const usdt = useMemo(() => (store.usdtRate > 0 ? (total / store.usdtRate).toFixed(2) : null), [total, store.usdtRate])

	async function checkCode() {
		if (!plan || !code.trim()) return
		setChecking(true)
		try {
			const r = await api<{ discount: string; code: string | null; error: string | null }>(`/api/shop/${store.slug}/discount`, { method: "POST", json: { planId: plan.id, code: code.trim() } })
			setDisc({ discount: Number(r.discount), code: r.code, error: r.error })
		} catch (err) {
			setDisc({ discount: 0, code: null, error: err instanceof Error ? err.message : "کد نامعتبر" })
		} finally {
			setChecking(false)
		}
	}

	async function submit(e: FormEvent) {
		e.preventDefault()
		if (!plan) return
		setError(null)
		setBusy(true)
		try {
			const r = await api<{ token: string }>(`/api/shop/${store.slug}/orders`, {
				method: "POST",
				json: { planId: plan.id, method, name: form.name || null, telegramId: form.telegramId || null, phone: form.phone || null, email: form.email || null, discountCode: disc && !disc.error ? disc.code : null, renewToken: renewToken || null },
			})
			window.location.href = `/shop/o/${r.token}`
		} catch (err) {
			setError(err instanceof Error ? err.message : "خطا در ثبت سفارش")
			setBusy(false)
		}
	}

	const style = { "--brand-primary": store.brand.primaryColor, "--brand-accent": store.brand.accentColor } as React.CSSProperties

	return (
		<div className="relative min-h-dvh px-4 py-8" style={style} dir="rtl">
			<div className="aurora" />
			<div className="mx-auto w-full max-w-3xl space-y-6">
				{/* header */}
				<header className="fade-up flex flex-col items-center gap-2 text-center">
					{store.brand.logoUrl ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={store.brand.logoUrl} alt={store.brand.name} className="h-16 w-16 rounded-2xl object-contain" />
					) : (
						<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet to-cyan text-2xl font-black text-white shadow-lg">{store.title.slice(0, 1)}</div>
					)}
					<h1 className="text-2xl font-bold neon-text">{store.title}</h1>
					{(store.description || store.brand.tagline) && <p className="max-w-md text-sm text-muted">{store.description || store.brand.tagline}</p>}
					{renewToken && <span className="badge bg-cyan/20 text-cyan">تمدید اشتراک فعلی</span>}
					{tgVerified && <span className="badge bg-success/20 text-success"><Check className="h-3 w-3" /> تلگرام تأیید شد</span>}
				</header>

				{/* plans */}
				<section className="fade-up space-y-3">
					<div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-violet" /> انتخاب پلن</div>
					{store.plans.length === 0 ? (
						<div className="glass p-8 text-center text-sm text-muted">فعلاً پلنی برای فروش وجود ندارد.</div>
					) : (
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{store.plans.map((p) => {
								const on = plan?.id === p.id
								return (
									<button type="button" key={p.id} onClick={() => { setPlan(p); setDisc(null) }} className={`glass relative flex flex-col gap-3 p-5 text-start transition ${on ? "neon-ring bg-violet/15" : "hover:bg-white/5"}`}>
										{p.badge && <span className="badge absolute -top-2 start-4 bg-violet/40 text-white">{p.badge}</span>}
										<div className="flex items-start justify-between">
											<div className="font-semibold">{p.name}</div>
											{on && <Check className="h-5 w-5 text-cyan" />}
										</div>
										<div className="flex items-baseline gap-2">
											<span className="num text-2xl font-bold">{formatNumber(Number(p.price), "fa")}</span>
											<span className="text-xs text-muted">تومان</span>
											{p.oldPrice ? <span className="num text-xs text-muted line-through">{formatNumber(Number(p.oldPrice), "fa")}</span> : null}
										</div>
										<div className="grid grid-cols-3 gap-2 text-center text-xs">
											<div className="glass-2 rounded-xl p-2"><Wifi className="mx-auto mb-1 h-3.5 w-3.5 text-cyan" /><div className="num font-semibold">{p.trafficGB ? `${formatNumber(p.trafficGB, "fa")} GB` : "نامحدود"}</div></div>
											<div className="glass-2 rounded-xl p-2"><Clock className="mx-auto mb-1 h-3.5 w-3.5 text-violet" /><div className="num font-semibold">{p.days ? `${formatNumber(p.days, "fa")} روز` : "نامحدود"}</div></div>
											<div className="glass-2 rounded-xl p-2"><Users className="mx-auto mb-1 h-3.5 w-3.5 text-magenta" /><div className="num font-semibold">{p.ipLimit ? `${formatNumber(p.ipLimit, "fa")} کاربر` : "نامحدود"}</div></div>
										</div>
										{p.description && <p className="text-xs text-muted">{p.description}</p>}
									</button>
								)
							})}
						</div>
					)}
				</section>

				{/* checkout */}
				{plan && (
					<form onSubmit={submit} className="fade-up glass space-y-5 p-5">
						<div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-cyan" /> اطلاعات و پرداخت</div>

						<div className="grid gap-3 sm:grid-cols-2">
							<label className="label">نام (اختیاری)<input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثلاً علی" /></label>
							<label className="label">شناسه عددی تلگرام {store.requireTelegram ? "*" : "(اختیاری)"}
								<input className="input mono mt-1" dir="ltr" inputMode="numeric" required={store.requireTelegram} readOnly={tgVerified} value={form.telegramId} onChange={(e) => setForm({ ...form, telegramId: e.target.value.replace(/\D/g, "") })} placeholder="123456789" />
								<span className="mt-1 block text-[11px] text-muted">با دستور /id در بات دریافت کنید — برای ارسال لینک اشتراک و یادآوری تمدید</span>
							</label>
							<label className="label">شماره موبایل {store.requirePhone ? "*" : "(اختیاری)"}<input className="input mono mt-1" dir="ltr" inputMode="tel" required={store.requirePhone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="09…" /></label>
							<label className="label">ایمیل (اختیاری)<input className="input mono mt-1" dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
						</div>

						{/* discount */}
						<div className="flex flex-wrap items-end gap-2">
							<label className="label flex-1">کد تخفیف<input className="input mono mt-1 uppercase" dir="ltr" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setDisc(null) }} placeholder="OFF20" /></label>
							<button type="button" className="btn" disabled={!code.trim() || checking} onClick={checkCode}>{checking ? <Loader2 className="h-4 w-4 spin" /> : <BadgePercent className="h-4 w-4" />} اعمال</button>
						</div>
						{disc && (disc.error ? <p className="text-xs text-danger">{disc.error}</p> : <p className="text-xs text-success">کد {disc.code} اعمال شد — {formatNumber(disc.discount, "fa")} تومان تخفیف</p>)}

						{/* method */}
						<div className="space-y-2">
							<div className="label">روش پرداخت</div>
							{store.methods.length === 0 && <p className="text-xs text-danger">هیچ روش پرداختی فعال نیست. با پشتیبانی تماس بگیرید.</p>}
							<div className="grid gap-2 sm:grid-cols-3">
								{store.methods.map((m) => {
									const M = METHOD_META[m]
									return (
										<button type="button" key={m} onClick={() => setMethod(m)} className={`glass-2 flex items-center gap-3 rounded-xl p-3 text-start transition ${method === m ? "neon-ring bg-violet/20" : "hover:bg-white/5"}`}>
											<M.icon className="h-5 w-5 shrink-0 text-cyan" />
											<div><div className="text-sm font-medium">{M.label}</div><div className="text-[11px] text-muted">{M.hint}</div></div>
										</button>
									)
								})}
							</div>
						</div>

						{/* summary */}
						<div className="glass-2 space-y-1 rounded-xl p-4 text-sm">
							<div className="flex justify-between"><span className="text-muted">پلن</span><span>{plan.name}</span></div>
							<div className="flex justify-between"><span className="text-muted">قیمت</span><span className="num">{formatNumber(price, "fa")} تومان</span></div>
							{discount > 0 && <div className="flex justify-between text-success"><span>تخفیف</span><span className="num">−{formatNumber(discount, "fa")}</span></div>}
							<div className="flex justify-between border-t border-white/10 pt-2 text-base font-bold"><span>مبلغ قابل پرداخت</span><span className="num neon-text">{formatNumber(total, "fa")} تومان{method === "USDT" && usdt ? <span className="ms-2 text-xs text-muted">≈ {usdt} USDT</span> : null}</span></div>
						</div>

						{store.rules && (
							<label className="flex items-start gap-2 text-xs text-muted">
								<input type="checkbox" className="mt-0.5" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
								<span><b className="text-fg">قوانین فروشگاه:</b> {store.rules}</span>
							</label>
						)}

						{error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}

						<button type="submit" className="btn btn-primary w-full py-3 text-base" disabled={busy || !accepted || (store.methods.length === 0 && total > 0)}>
							{busy ? <Loader2 className="h-5 w-5 spin" /> : <ChevronRight className="h-5 w-5 rotate-180" />} {total === 0 ? "دریافت رایگان" : "ادامه و پرداخت"}
						</button>
					</form>
				)}

				{/* footer */}
				<footer className="fade-up flex flex-wrap items-center justify-center gap-3 text-xs text-muted">
					{store.supportUrl && <a className="btn btn-ghost btn-sm" href={store.supportUrl} target="_blank" rel="noreferrer"><LifeBuoy className="h-4 w-4" /> پشتیبانی</a>}
					{store.brand.telegramUrl && <a className="btn btn-ghost btn-sm" href={store.brand.telegramUrl} target="_blank" rel="noreferrer"><Send className="h-4 w-4" /> تلگرام</a>}
					<span>© {new Date().getFullYear()} {store.brand.name}</span>
				</footer>
			</div>
		</div>
	)
}
