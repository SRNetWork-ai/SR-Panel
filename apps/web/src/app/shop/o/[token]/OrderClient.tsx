"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { AlertTriangle, Check, CheckCircle2, Clock, Copy, CreditCard, ExternalLink, FileImage, LifeBuoy, Loader2, RefreshCw, Send, ShieldCheck, Upload, XCircle } from "lucide-react"
import { api, copyText } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { QR } from "@/components/QR"

type Method = "USDT" | "CARD" | "ZARINPAL" | "WALLET" | "MANUAL"
type Next =
	| { type: "usdt"; address: string; network: string; amountUsdt: string; rate: number }
	| { type: "card"; cardNumber: string; cardHolder: string | null; cardBank: string | null }
	| { type: "redirect"; url: string }
	| { type: "review" }
	| { type: "done" }
	| { type: "none" }
export type PublicOrder = {
	token: string
	status: "PENDING" | "PAID" | "FULFILLED" | "CANCELED" | "EXPIRED"
	createdAt: string
	expiresAt: string | null
	plan: { name: string; trafficGB: number; days: number; ipLimit: number }
	amount: string
	listPrice: string
	discountAmount: string
	customer: { name: string | null; telegramId: string | null; phone: string | null }
	payment: { id: string; method: Method; status: "PENDING" | "REVIEW" | "CONFIRMED" | "REJECTED" | "EXPIRED"; amountUsdt: string | null; txid: string | null; receiptRef: string | null; error: string | null; reviewNote: string | null } | null
	next: Next
	client: { name: string; subUrl: string; pageUrl: string; expiresAt: string | null; trafficGB: number } | null
	store: { slug: string; title: string; brand: { name: string; primaryColor: string; accentColor: string; logoUrl: string | null; telegramUrl: string | null }; supportUrl: string | null; url: string }
	error: string | null
}

const STATUS_FA: Record<PublicOrder["status"], string> = { PENDING: "در انتظار پرداخت", PAID: "پرداخت شد — در حال ساخت اشتراک", FULFILLED: "تحویل شد", CANCELED: "لغو شد", EXPIRED: "منقضی شد" }
const fa = (n: string | number) => formatNumber(Number(n), "fa")

function Countdown({ until }: { until: string }) {
	const [left, setLeft] = useState(() => Math.max(0, new Date(until).getTime() - Date.now()))
	useEffect(() => {
		const id = setInterval(() => setLeft(Math.max(0, new Date(until).getTime() - Date.now())), 1000)
		return () => clearInterval(id)
	}, [until])
	const m = Math.floor(left / 60000)
	const s = Math.floor((left % 60000) / 1000)
	return <span className="num mono">{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}</span>
}

export function OrderClient({ initial, payResult }: { initial: PublicOrder; payResult?: string }) {
	const [o, setO] = useState<PublicOrder>(initial)
	const [busy, setBusy] = useState(false)
	const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
		payResult === "ok" ? { kind: "ok", text: "پرداخت با موفقیت انجام شد." } : payResult === "canceled" ? { kind: "err", text: "پرداخت لغو شد. می‌توانید دوباره تلاش کنید." } : payResult === "failed" ? { kind: "err", text: "پرداخت ناموفق بود." } : null,
	)
	const [txid, setTxid] = useState("")
	const [receiptRef, setReceiptRef] = useState("")
	const [cardPan, setCardPan] = useState("")
	const [file, setFile] = useState<File | null>(null)
	const [copied, setCopied] = useState<string | null>(null)
	const fileRef = useRef<HTMLInputElement>(null)

	const refresh = useCallback(async () => {
		try { setO(await api<PublicOrder>(`/api/shop/order/${initial.token}`)) } catch { /* ignore */ }
	}, [initial.token])

	// poll while something is in flight
	const live = o.status === "PENDING" || o.status === "PAID" || o.payment?.status === "REVIEW"
	useEffect(() => {
		if (!live) return
		const id = setInterval(refresh, 8000)
		return () => clearInterval(id)
	}, [live, refresh])

	const copy = async (k: string, v: string) => { if (await copyText(v)) { setCopied(k); setTimeout(() => setCopied(null), 1500) } }

	async function sendTxid(e: FormEvent) {
		e.preventDefault()
		setBusy(true)
		setMsg(null)
		try {
			await api(`/api/shop/order/${o.token}/proof`, { method: "POST", json: { txid: txid.trim() } })
			setMsg({ kind: "ok", text: "هش تراکنش ثبت شد. در حال بررسی…" })
			await refresh()
		} catch (err) {
			setMsg({ kind: "err", text: err instanceof Error ? err.message : "خطا" })
		} finally {
			setBusy(false)
		}
	}
	async function sendReceipt(e: FormEvent) {
		e.preventDefault()
		setBusy(true)
		setMsg(null)
		try {
			const fd = new FormData()
			if (file) fd.append("file", file)
			fd.append("receiptRef", receiptRef.trim())
			fd.append("cardPan", cardPan.trim())
			const res = await fetch(`/api/shop/order/${o.token}/receipt`, { method: "POST", body: fd })
			if (!res.ok) {
				const j = (await res.json().catch(() => ({}))) as { error?: string }
				throw new Error(j.error || "خطا در ارسال رسید")
			}
			setMsg({ kind: "ok", text: "رسید ارسال شد. پس از تأیید، اشتراک شما همین‌جا نمایش داده می‌شود." })
			await refresh()
		} catch (err) {
			setMsg({ kind: "err", text: err instanceof Error ? err.message : "خطا" })
		} finally {
			setBusy(false)
		}
	}

	const style = { "--brand-primary": o.store.brand.primaryColor, "--brand-accent": o.store.brand.accentColor } as React.CSSProperties
	const p = o.payment
	const waitingProof = o.status === "PENDING" && p && p.status === "PENDING"
	const inReview = p?.status === "REVIEW"
	const rejected = p?.status === "REJECTED"

	return (
		<div className="relative min-h-dvh px-4 py-8" style={style} dir="rtl">
			<div className="aurora" />
			<div className="mx-auto w-full max-w-lg space-y-5">
				<header className="fade-up flex items-center justify-between">
					<a href={o.store.url} className="flex items-center gap-2 text-sm text-muted hover:text-fg">
						{o.store.brand.logoUrl ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img src={o.store.brand.logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />
						) : <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-cyan text-sm font-black text-white">{o.store.title.slice(0, 1)}</div>}
						<span className="font-semibold text-fg">{o.store.title}</span>
					</a>
					<button type="button" className="btn btn-ghost btn-sm" onClick={refresh}><RefreshCw className="h-4 w-4" /></button>
				</header>

				{/* status banner */}
				<div className={`fade-up glass flex items-center gap-3 p-4 ${o.status === "FULFILLED" ? "neon-ring" : ""}`}>
					{o.status === "FULFILLED" ? <CheckCircle2 className="h-8 w-8 shrink-0 text-success" /> : o.status === "CANCELED" || o.status === "EXPIRED" ? <XCircle className="h-8 w-8 shrink-0 text-danger" /> : inReview ? <ShieldCheck className="h-8 w-8 shrink-0 text-warning" /> : <Clock className="h-8 w-8 shrink-0 text-cyan pulse-dot" />}
					<div className="flex-1">
						<div className="font-semibold">{inReview && o.status === "PENDING" ? "در انتظار تأیید پرداخت" : STATUS_FA[o.status]}</div>
						<div className="text-xs text-muted">سفارش <span className="mono">{o.token.slice(0, 8)}</span> · {o.plan.name}</div>
					</div>
					{o.status === "PENDING" && o.expiresAt && !inReview && <div className="text-end text-xs text-muted">مهلت<br /><Countdown until={o.expiresAt} /></div>}
				</div>

				{msg && <div className={`fade-up rounded-xl p-3 text-sm ${msg.kind === "ok" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{msg.text}</div>}
				{(o.error || p?.error) && o.status !== "FULFILLED" && <div className="fade-up flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{o.error || p?.error}</span></div>}
				{rejected && <div className="fade-up rounded-xl bg-danger/10 p-3 text-sm text-danger">پرداخت رد شد{p?.reviewNote ? `: ${p.reviewNote}` : "."} برای پیگیری با پشتیبانی تماس بگیرید.</div>}

				{/* delivered */}
				{o.status === "FULFILLED" && o.client && (
					<section className="fade-up glass space-y-4 p-5 text-center">
						<div className="text-sm text-muted">اشتراک شما آماده است 🎉</div>
						<QR value={o.client.subUrl} size={180} />
						<div className="flex items-center gap-2">
							<input readOnly dir="ltr" value={o.client.subUrl} className="input mono flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
							<button type="button" className="btn" onClick={() => copy("sub", o.client!.subUrl)}>{copied === "sub" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
						</div>
						<a className="btn btn-primary w-full" href={o.client.pageUrl}><ExternalLink className="h-4 w-4" /> صفحه اشتراک و راهنمای اتصال</a>
						<p className="text-[11px] text-muted">این لینک را ذخیره کنید. {o.customer.telegramId ? "نسخه‌ای از آن به تلگرام شما هم ارسال شد." : ""}</p>
					</section>
				)}

				{/* pay: USDT */}
				{waitingProof && o.next.type === "usdt" && (
					<form onSubmit={sendTxid} className="fade-up glass space-y-4 p-5">
						<div className="text-center">
							<div className="text-sm text-muted">مبلغ <b className="num neon-text text-lg">{o.next.amountUsdt} USDT</b> را در شبکهٔ <b>{o.next.network}</b> به آدرس زیر ارسال کنید</div>
							<div className="my-3 flex justify-center"><QR value={o.next.address} size={160} /></div>
							<div className="flex items-center gap-2">
								<input readOnly dir="ltr" value={o.next.address} className="input mono flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
								<button type="button" className="btn" onClick={() => copy("addr", (o.next as { address: string }).address)}>{copied === "addr" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
							</div>
							<p className="mt-2 text-[11px] text-muted">نرخ: {fa(o.next.rate)} تومان · مبلغ را دقیق واریز کنید. فقط شبکه TRC20.</p>
						</div>
						<label className="label">هش تراکنش (TXID)<input className="input mono mt-1" dir="ltr" required minLength={20} value={txid} onChange={(e) => setTxid(e.target.value.trim())} placeholder="a1b2c3…" /></label>
						<button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 spin" /> : <Send className="h-4 w-4" />} من پرداخت کردم</button>
					</form>
				)}

				{/* pay: CARD */}
				{waitingProof && o.next.type === "card" && (
					<form onSubmit={sendReceipt} className="fade-up glass space-y-4 p-5">
						<div className="glass-2 space-y-2 rounded-xl p-4 text-center">
							<div className="text-xs text-muted">مبلغ <b className="num text-fg">{fa(o.amount)}</b> تومان را به کارت زیر انتقال دهید</div>
							<div className="flex items-center justify-center gap-2">
								<span dir="ltr" className="mono text-xl tracking-widest">{o.next.cardNumber.replace(/(\d{4})(?=\d)/g, "$1 ")}</span>
								<button type="button" className="btn btn-sm" onClick={() => copy("card", (o.next as { cardNumber: string }).cardNumber)}>{copied === "card" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
							</div>
							<div className="text-sm">{o.next.cardHolder}{o.next.cardBank ? ` · ${o.next.cardBank}` : ""}</div>
						</div>
						<label className="label">شماره پیگیری / مرجع<input className="input mono mt-1" dir="ltr" required={!file} value={receiptRef} onChange={(e) => setReceiptRef(e.target.value)} placeholder="123456" /></label>
						<label className="label">۴ رقم آخر کارت واریزکننده (اختیاری)<input className="input mono mt-1" dir="ltr" inputMode="numeric" maxLength={4} value={cardPan} onChange={(e) => setCardPan(e.target.value.replace(/\D/g, ""))} /></label>
						<div>
							<input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
							<button type="button" className="btn w-full" onClick={() => fileRef.current?.click()}>{file ? <FileImage className="h-4 w-4 text-success" /> : <Upload className="h-4 w-4" />} {file ? file.name : "ارسال تصویر رسید (اختیاری — حداکثر ۳MB)"}</button>
						</div>
						<button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 spin" /> : <Send className="h-4 w-4" />} ارسال رسید و اعلام پرداخت</button>
					</form>
				)}

				{/* pay: gateway */}
				{waitingProof && o.next.type === "redirect" && (
					<div className="fade-up glass space-y-3 p-5 text-center">
						<div className="text-sm text-muted">مبلغ <b className="num text-fg">{fa(o.amount)}</b> تومان از طریق درگاه بانکی</div>
						<a className="btn btn-primary w-full py-3" href={o.next.url}><CreditCard className="h-5 w-5" /> انتقال به درگاه پرداخت</a>
						<p className="text-[11px] text-muted">پس از پرداخت به همین صفحه بازمی‌گردید و اشتراک فوراً ساخته می‌شود.</p>
					</div>
				)}

				{/* in review */}
				{inReview && o.status !== "FULFILLED" && (
					<div className="fade-up glass space-y-2 p-5 text-center">
						<ShieldCheck className="mx-auto h-10 w-10 text-warning" />
						<div className="font-semibold">پرداخت شما در صف بررسی است</div>
						<p className="text-xs text-muted">معمولاً کمتر از چند دقیقه تا چند ساعت طول می‌کشد. این صفحه به‌صورت خودکار به‌روز می‌شود{o.customer.telegramId ? " و نتیجه به تلگرام شما هم ارسال می‌شود" : ""}.</p>
						{p?.txid && <p className="mono text-[11px] text-muted" dir="ltr">TXID: {p.txid}</p>}
						{p?.receiptRef && <p className="mono text-[11px] text-muted" dir="ltr">Ref: {p.receiptRef}</p>}
					</div>
				)}

				{/* summary */}
				<section className="fade-up glass space-y-1 p-4 text-sm">
					<div className="flex justify-between"><span className="text-muted">پلن</span><span>{o.plan.name}</span></div>
					<div className="flex justify-between"><span className="text-muted">حجم / مدت / کاربر</span><span className="num">{o.plan.trafficGB ? `${fa(o.plan.trafficGB)} GB` : "نامحدود"} · {o.plan.days ? `${fa(o.plan.days)} روز` : "نامحدود"} · {o.plan.ipLimit ? fa(o.plan.ipLimit) : "∞"}</span></div>
					{Number(o.discountAmount) > 0 && <div className="flex justify-between text-success"><span>تخفیف</span><span className="num">−{fa(o.discountAmount)}</span></div>}
					<div className="flex justify-between border-t border-white/10 pt-2 font-bold"><span>مبلغ</span><span className="num">{fa(o.amount)} تومان{p?.amountUsdt ? <span className="ms-2 text-xs text-muted">≈ {p.amountUsdt} USDT</span> : null}</span></div>
					{(o.status === "CANCELED" || o.status === "EXPIRED") && <a href={o.store.url} className="btn w-full mt-2">سفارش جدید</a>}
				</section>

				<footer className="fade-up flex flex-wrap items-center justify-center gap-3 text-xs text-muted">
					{o.store.supportUrl && <a className="btn btn-ghost btn-sm" href={o.store.supportUrl} target="_blank" rel="noreferrer"><LifeBuoy className="h-4 w-4" /> پشتیبانی</a>}
					{o.store.brand.telegramUrl && <a className="btn btn-ghost btn-sm" href={o.store.brand.telegramUrl} target="_blank" rel="noreferrer"><Send className="h-4 w-4" /> تلگرام</a>}
					<span>© {new Date().getFullYear()} {o.store.brand.name}</span>
				</footer>
			</div>
		</div>
	)
}
