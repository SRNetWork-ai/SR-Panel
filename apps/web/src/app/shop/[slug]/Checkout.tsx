"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { BadgeCheck, BadgePercent, ChevronRight, Clock, Loader2, RefreshCw, ShieldCheck } from "lucide-react"
import { api } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { FX_SOURCE_FA, METHOD_META, currencyLabel, type Method, type PublicPlan, type PublicStore } from "./types"

/** Identity + discount + payment method + order submission. */

export function Checkout({
	store,
	plan,
	renewToken,
	identity,
	onChangePlan,
}: {
	store: PublicStore
	plan: PublicPlan
	renewToken?: string
	identity: { telegramId: string; name: string; verified: boolean }
	onChangePlan: () => void
}) {
	const currency = currencyLabel(store.currency)
	const [method, setMethod] = useState<Method>(store.methods[0] ?? "CARD")
	const [form, setForm] = useState({ name: identity.name, telegramId: identity.telegramId, phone: "", email: "" })
	const [code, setCode] = useState("")
	const [disc, setDisc] = useState<{ discount: number; code: string | null; error?: string | null } | null>(null)
	const [checking, setChecking] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [accepted, setAccepted] = useState(!store.rules)

	// a verified Telegram identity may arrive after the first render
	useEffect(() => {
		if (!identity.telegramId && !identity.name) return
		setForm((f) => ({ ...f, telegramId: identity.telegramId || f.telegramId, name: f.name || identity.name }))
	}, [identity.telegramId, identity.name])

	// a discount code is validated against one plan only
	useEffect(() => {
		setDisc(null)
	}, [plan.id])

	const price = Number(plan.price)
	const discount = disc && !disc.error ? disc.discount : 0
	const total = Math.max(0, price - discount)
	const usdt = useMemo(() => (store.usdtRate > 0 ? (total / store.usdtRate).toFixed(2) : null), [total, store.usdtRate])
	const rateSource = FX_SOURCE_FA[store.fx.source] ?? store.fx.source

	async function checkCode() {
		if (!code.trim()) return
		setChecking(true)
		try {
			const r = await api<{ discount: string; code: string | null; error: string | null }>("/api/shop/" + store.slug + "/discount", { method: "POST", json: { planId: plan.id, code: code.trim() } })
			setDisc({ discount: Number(r.discount), code: r.code, error: r.error })
		} catch (err) {
			setDisc({ discount: 0, code: null, error: err instanceof Error ? err.message : "کد نامعتبر" })
		} finally {
			setChecking(false)
		}
	}

	async function submit(e: FormEvent) {
		e.preventDefault()
		setError(null)
		setBusy(true)
		try {
			const r = await api<{ token: string }>("/api/shop/" + store.slug + "/orders", {
				method: "POST",
				json: {
					planId: plan.id,
					method,
					name: form.name || null,
					telegramId: form.telegramId || null,
					phone: form.phone || null,
					email: form.email || null,
					discountCode: disc && !disc.error ? disc.code : null,
					renewToken: renewToken || null,
				},
			})
			window.location.href = "/shop/o/" + r.token
		} catch (err) {
			setError(err instanceof Error ? err.message : "خطا در ثبت سفارش")
			setBusy(false)
		}
	}

	return (
		<form onSubmit={submit} className="fade-up glass space-y-5 p-5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-cyan" /> اطلاعات و پرداخت</div>
				<button type="button" className="btn btn-ghost btn-sm" onClick={onChangePlan}>تغییر پلن</button>
			</div>

			<div className="glass-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl p-3 text-xs">
				<span className="font-semibold">{plan.name}</span>
				{plan.trafficGB ? <span className="num text-muted">{formatNumber(plan.trafficGB, "fa")} GB</span> : <span className="text-muted">حجم نامحدود</span>}
				{plan.days ? <span className="num text-muted">{formatNumber(plan.days, "fa")} روز</span> : <span className="text-muted">مدت نامحدود</span>}
				{plan.ipLimit ? <span className="num text-muted">{formatNumber(plan.ipLimit, "fa")} اتصال همزمان</span> : null}
				{plan.serviceName ? <span className="text-muted">{plan.serviceName}</span> : null}
			</div>

			{renewToken ? (
				<p className="flex items-start gap-2 rounded-xl bg-cyan/10 p-3 text-xs leading-5 text-cyan">
					<RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
					<span>این خرید به‌عنوان «تمدید» روی اشتراک فعلی شما ثبت می‌شود؛ لینک اشتراک تغییر نمی‌کند و حجم/مدت جدید روی همان لینک اعمال خواهد شد.</span>
				</p>
			) : null}

			<div className="grid gap-3 sm:grid-cols-2">
				<label className="label">نام (اختیاری)<input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مطلاً علی" /></label>
				<label className="label">شناسه عددی تلگرام {store.requireTelegram ? "*" : "(اختیاری)"}
					<input className="input mono mt-1" dir="ltr" inputMode="numeric" required={store.requireTelegram} readOnly={identity.verified} value={form.telegramId} onChange={(e) => setForm({ ...form, telegramId: e.target.value.replace(/\D/g, "") })} placeholder="123456789" />
					<span className="mt-1 block text-[11px] text-muted">با دستور /id در بات دریافت کنید — برای ارسال لینک اشتراک و یادآوری تمدید</span>
				</label>
				<label className="label">شماره موبایل {store.requirePhone ? "*" : "(اختیاری)"}<input className="input mono mt-1" dir="ltr" inputMode="tel" required={store.requirePhone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="09…" /></label>
				<label className="label">ایمیل (اختیاری)<input className="input mono mt-1" dir="ltr" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
			</div>

			<div className="flex flex-wrap items-end gap-2">
				<label className="label flex-1">کد تخفیف<input className="input mono mt-1 uppercase" dir="ltr" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setDisc(null) }} placeholder="OFF20" /></label>
				<button type="button" className="btn" disabled={!code.trim() || checking} onClick={checkCode}>{checking ? <Loader2 className="h-4 w-4 spin" /> : <BadgePercent className="h-4 w-4" />} اعمال</button>
			</div>
			{disc ? (disc.error ? <p className="text-xs text-danger">{disc.error}</p> : <p className="text-xs text-success">کد {disc.code} اعمال شد — {formatNumber(disc.discount, "fa")} {currency} تخفیف</p>) : null}

			<div className="space-y-2">
				<div className="label">روش پرداخت</div>
				{store.methods.length === 0 ? <p className="text-xs text-danger">هیچ روش پرداختی فعال نیست. با پشتیبانی تماس بگیرید.</p> : null}
				<div className="grid gap-2 sm:grid-cols-3">
					{store.methods.map((m) => {
						const meta = METHOD_META[m]
						return (
							<button type="button" key={m} onClick={() => setMethod(m)} className={"glass-2 flex items-center gap-3 rounded-xl p-3 text-start transition " + (method === m ? "neon-ring bg-violet/20" : "hover:bg-white/5")}>
								<meta.icon className="h-5 w-5 shrink-0 text-cyan" />
								<div><div className="text-sm font-medium">{meta.label}</div><div className="text-[11px] text-muted">{meta.hint}</div></div>
							</button>
						)
					})}
				</div>
			</div>

			<div className="glass-2 space-y-1 rounded-xl p-4 text-sm">
				<div className="flex justify-between"><span className="text-muted">پلن</span><span>{plan.name}</span></div>
				<div className="flex justify-between"><span className="text-muted">قیمت</span><span className="num">{formatNumber(price, "fa")} {currency}</span></div>
				{discount > 0 ? <div className="flex justify-between text-success"><span>تخفیف</span><span className="num">−{formatNumber(discount, "fa")}</span></div> : null}
				<div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/10 pt-2 text-base font-bold">
					<span>مبلغ قابل پرداخت</span>
					<span className="num neon-text">{formatNumber(total, "fa")} {currency}{method === "USDT" && usdt ? <span className="ms-2 text-xs font-normal text-muted">≈ {usdt} USDT</span> : null}</span>
				</div>
			</div>

			<div className="space-y-1 text-[11px] leading-5 text-muted">
				{store.paymentTtlMin > 0 && total > 0 ? <p className="flex items-center gap-1"><Clock className="h-3 w-3" /> مهلت پرداخت پس از ثبت سفارش: {formatNumber(store.paymentTtlMin, "fa")} دقیقه</p> : null}
				{method === "USDT" ? <p>{store.fx.auto ? "نرخ تتر به صورت خودکار از " + rateSource + " دریافت می‌شود." : "نرخ تتر توسط فروشنده تعیین شده است."}{store.fx.stale ? " (ممکن است کمی قدیمی باشد)" : ""}</p> : null}
				{method === "CARD" && store.cardAutoVerify ? (
					<p className="flex items-start gap-1 text-success"><BadgeCheck className="mt-0.5 h-3 w-3 shrink-0" /> پرداخت کارت به کارت خودکار تأیید می‌شود؛ لطفاً دقیقاً همان مبلغی را که در صفحه پرداخت نمایش داده می‌شود واریز کنید.</p>
				) : null}
				{method === "CARD" && !store.cardAutoVerify ? <p>پس از واریز، رسید را در صفحه سفارش ثبت کنید تا پشتیبانی بررسی کند.</p> : null}
			</div>

			{store.rules ? (
				<label className="flex items-start gap-2 text-xs text-muted">
					<input type="checkbox" className="mt-0.5" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
					<span><b className="text-fg">قوانین فروشگاه:</b> {store.rules}</span>
				</label>
			) : null}

			{error ? <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

			<button type="submit" className="btn btn-primary w-full py-3 text-base" disabled={busy || !accepted || (store.methods.length === 0 && total > 0)}>
				{busy ? <Loader2 className="h-5 w-5 spin" /> : <ChevronRight className="h-5 w-5 rotate-180" />} {total === 0 ? "دریافت رایگان" : "ادامه و پرداخت"}
			</button>
		</form>
	)
}
