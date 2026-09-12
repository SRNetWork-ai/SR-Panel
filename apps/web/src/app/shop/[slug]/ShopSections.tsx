import { BadgeCheck, Camera, Clock, HelpCircle, Info, LifeBuoy, MessageCircle, MonitorSmartphone, Send, ShieldCheck, Sparkles, Zap } from "lucide-react"
import { formatNumber } from "@/lib/format"
import { PAGE_ICON, socialLinks, type PublicStore } from "./types"

/**
 * Presentational sections of the public storefront. Everything here is driven
 * by the seller-editable page content (core services/storePage), so an empty
 * or disabled section simply renders nothing.
 */

function Heading({ icon: Icon, title, hint }: { icon: typeof Sparkles; title: string; hint?: string }) {
	return (
		<div className="space-y-1 text-center">
			<div className="inline-flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-violet" /> {title}</div>
			{hint ? <p className="text-xs text-muted">{hint}</p> : null}
		</div>
	)
}

function statTiles(store: PublicStore) {
	const p = store.page
	const out: { label: string; value: string }[] = []
	if (p.statCustomers) out.push({ label: "کاربر فعال", value: p.statCustomers })
	if (p.statUptime) out.push({ label: "پایداری سرویس", value: p.statUptime })
	if (p.statLocations) out.push({ label: "لوکیشن", value: p.statLocations })
	else if (store.stats.locations > 0) out.push({ label: "لوکیشن", value: formatNumber(store.stats.locations, "fa") })
	if (store.stats.plans > 0) out.push({ label: "پلن فعال", value: formatNumber(store.stats.plans, "fa") })
	if (store.stats.sold > 0) out.push({ label: "اشتراک فروخته‌شده", value: formatNumber(store.stats.sold, "fa") })
	return out.slice(0, 4)
}

export function StatsRow({ store }: { store: PublicStore }) {
	const tiles = statTiles(store)
	if (tiles.length === 0) return null
	return (
		<div className="mx-auto grid max-w-2xl grid-cols-2 gap-2 pt-2 sm:grid-cols-4">
			{tiles.map((t) => (
				<div key={t.label} className="glass-2 rounded-2xl p-3 text-center">
					<div className="num text-lg font-bold neon-text">{t.value}</div>
					<div className="text-[11px] text-muted">{t.label}</div>
				</div>
			))}
		</div>
	)
}

export function Hero({ store }: { store: PublicStore }) {
	const p = store.page
	if (!p.showHero) return null
	return (
		<section className="fade-up glass relative overflow-hidden p-6 text-center sm:p-10">
			<div className="pointer-events-none absolute -top-24 start-1/2 h-52 w-52 -translate-x-1/2 rounded-full bg-violet/30 blur-3xl" />
			<div className="relative space-y-4">
				{p.heroBadge ? <span className="badge bg-violet/25 text-white"><Sparkles className="h-3 w-3" /> {p.heroBadge}</span> : null}
				{p.heroTitle ? <h2 className="neon-text text-2xl font-black leading-9 sm:text-4xl sm:leading-tight">{p.heroTitle}</h2> : null}
				{p.heroSubtitle ? <p className="mx-auto max-w-xl text-sm leading-6 text-muted">{p.heroSubtitle}</p> : null}
				<div className="flex flex-wrap items-center justify-center gap-2">
					<a href="#plans" className="btn btn-primary px-6 py-2.5">{p.heroCta || "مشاهده پلن‌ها"}</a>
					{p.showFaq && p.faq.length > 0 ? <a href="#faq" className="btn btn-ghost">سوالات متداول</a> : null}
				</div>
				<StatsRow store={store} />
			</div>
		</section>
	)
}

export function TrustRow({ store }: { store: PublicStore }) {
	const p = store.page
	if (!p.showTrust) return null
	const items: { icon: typeof ShieldCheck; text: string }[] = []
	if (p.trustInstant) items.push({ icon: Zap, text: "تحویل فوری پس از پرداخت" })
	if (p.trustMoneyBack) items.push({ icon: ShieldCheck, text: "ضمانت بازگشت وجه" })
	if (p.trustMultiDevice) items.push({ icon: MonitorSmartphone, text: "مناسب همه دستگاه‌ها" })
	if (p.trustSupport) items.push({ icon: LifeBuoy, text: "پشتیبانی واقعی در تلگرام" })
	if (store.cardAutoVerify) items.push({ icon: BadgeCheck, text: "تأیید خودکار کارت به کارت" })
	if (items.length === 0) return null
	return (
		<div className="fade-up grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
			{items.slice(0, 4).map((i) => (
				<div key={i.text} className="glass-2 flex items-center gap-2 rounded-2xl p-3 text-xs">
					<i.icon className="h-4 w-4 shrink-0 text-cyan" />
					<span>{i.text}</span>
				</div>
			))}
		</div>
	)
}

export function Notice({ store }: { store: PublicStore }) {
	const text = store.page.noticeText
	if (!text) return null
	return (
		<div className="fade-up flex items-start gap-2 rounded-2xl bg-warning/10 p-3 text-xs leading-5 text-warning">
			<Info className="mt-0.5 h-4 w-4 shrink-0" />
			<span>{text}</span>
		</div>
	)
}

export function Features({ store }: { store: PublicStore }) {
	const p = store.page
	if (!p.showFeatures || p.features.length === 0) return null
	return (
		<section className="fade-up space-y-3">
			<Heading icon={Sparkles} title="چرا ما؟" hint="امکاناتی که با هر اشتراک دریافت می‌کنید" />
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{p.features.map((f, i) => {
					const Icon = PAGE_ICON[f.icon] ?? PAGE_ICON.star
					return (
						<div key={String(i) + f.title} className="glass space-y-2 p-4">
							<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet/20"><Icon className="h-4 w-4 text-cyan" /></div>
							{f.title ? <div className="text-sm font-semibold">{f.title}</div> : null}
							{f.text ? <p className="text-xs leading-5 text-muted">{f.text}</p> : null}
						</div>
					)
				})}
			</div>
		</section>
	)
}

export function Steps({ store }: { store: PublicStore }) {
	const p = store.page
	if (!p.showSteps || p.steps.length === 0) return null
	return (
		<section className="fade-up space-y-3">
			<Heading icon={Clock} title="خرید در چند دقیقه" hint="فرایند تحویل اشتراک" />
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{p.steps.map((s, i) => (
					<div key={String(i) + s.title} className="glass relative space-y-2 p-4">
						<span className="num absolute -top-3 start-4 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet to-cyan text-xs font-bold text-white">{formatNumber(i + 1, "fa")}</span>
						<div className="pt-3 text-sm font-semibold">{s.title}</div>
						{s.text ? <p className="text-xs leading-5 text-muted">{s.text}</p> : null}
					</div>
				))}
			</div>
		</section>
	)
}

export function Faq({ store }: { store: PublicStore }) {
	const p = store.page
	if (!p.showFaq || p.faq.length === 0) return null
	return (
		<section id="faq" className="fade-up scroll-mt-4 space-y-3">
			<Heading icon={HelpCircle} title="سوالات متداول" />
			<div className="space-y-2">
				{p.faq.map((f, i) => (
					<details key={String(i) + f.q} className="glass p-4">
						<summary className="cursor-pointer list-none text-sm font-medium">{f.q}</summary>
						<p className="mt-2 text-xs leading-6 text-muted">{f.a}</p>
					</details>
				))}
			</div>
		</section>
	)
}

export function ShopFooter({ store }: { store: PublicStore }) {
	const links = socialLinks(store)
	return (
		<footer className="fade-up space-y-3 border-t border-white/10 pt-5 text-center text-xs text-muted">
			<div className="flex flex-wrap items-center justify-center gap-2">
				{links.support ? <a className="btn btn-ghost btn-sm" href={links.support} target="_blank" rel="noreferrer"><LifeBuoy className="h-4 w-4" /> پشتیبانی</a> : null}
				{links.tg ? <a className="btn btn-ghost btn-sm" href={links.tg} target="_blank" rel="noreferrer"><Send className="h-4 w-4" /> تلگرام</a> : null}
				{links.wa ? <a className="btn btn-ghost btn-sm" href={links.wa} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> واتساپ</a> : null}
				{links.ig ? <a className="btn btn-ghost btn-sm" href={links.ig} target="_blank" rel="noreferrer"><Camera className="h-4 w-4" /> اینستاگرام</a> : null}
			</div>
			{store.page.footerNote ? <p className="mx-auto max-w-lg leading-5">{store.page.footerNote}</p> : null}
			<p>© {new Date().getFullYear()} {store.brand.name}</p>
		</footer>
	)
}
