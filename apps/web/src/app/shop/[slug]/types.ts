import { Clock, CreditCard, Globe, Headphones, Infinity as InfinityIcon, Landmark, Lock, MonitorSmartphone, ShieldCheck, Star, Wallet, Zap } from "lucide-react"

/**
 * Shared DTOs + labels for the public storefront (`/shop/[slug]`).
 *
 * Mirrors `publicStorePayload()` of @srpanel/core, but is kept local so the
 * client bundle never imports server-only code.
 */

export type Method = "USDT" | "CARD" | "ZARINPAL"

export type PublicPlan = {
	id: string
	name: string
	description: string | null
	badge: string | null
	trafficGB: number
	days: number
	ipLimit: number
	price: string
	oldPrice: string | null
	sold: number
	serviceName: string | null
	servers: number
	locations: string[]
	pricePerDay: number | null
	priceUsdt: string | null
}

export type StorePageIcon = "shield" | "bolt" | "globe" | "headset" | "infinity" | "lock" | "device" | "star" | "clock" | "wallet"

export type StorePage = {
	heroBadge: string
	heroTitle: string
	heroSubtitle: string
	heroCta: string
	showHero: boolean
	showFeatures: boolean
	showSteps: boolean
	showFaq: boolean
	showTrust: boolean
	showUsdtPrice: boolean
	statCustomers: string
	statUptime: string
	statLocations: string
	features: { icon: StorePageIcon; title: string; text: string }[]
	steps: { title: string; text: string }[]
	faq: { q: string; a: string }[]
	trustMoneyBack: boolean
	trustInstant: boolean
	trustSupport: boolean
	trustMultiDevice: boolean
	telegramChannel: string
	instagram: string
	whatsapp: string
	noticeText: string
	footerNote: string
}

export type PublicBrand = {
	name: string
	tagline: string | null
	logoUrl: string | null
	primaryColor: string
	accentColor: string
	telegramUrl: string | null
	supportUrl: string | null
}

export type PublicStore = {
	slug: string
	title: string
	description: string | null
	rules: string | null
	supportUrl: string | null
	currency: string
	brand: PublicBrand
	methods: Method[]
	requireTelegram: boolean
	requirePhone: boolean
	usdtRate: number
	paymentTtlMin: number
	fx: { auto: boolean; source: string; at: string | null; stale: boolean }
	cardAutoVerify: boolean
	page: StorePage
	stats: { plans: number; locations: number; sold: number }
	plans: PublicPlan[]
}

export const METHOD_META: Record<Method, { label: string; hint: string; icon: typeof CreditCard }> = {
	USDT: { label: "تتر (USDT · TRC20)", hint: "پرداخت ارز دیجیتال با تأیید خودکار تراکنش", icon: Zap },
	CARD: { label: "کارت به کارت", hint: "انتقال بانکی و ثبت رسید — تأیید سریع", icon: Landmark },
	ZARINPAL: { label: "درگاه بانکی (زرین‌پال)", hint: "پرداخت آنلاین با کارت بانکی — تحویل فوری", icon: CreditCard },
}

export const PAGE_ICON: Record<StorePageIcon, typeof ShieldCheck> = {
	shield: ShieldCheck,
	bolt: Zap,
	globe: Globe,
	headset: Headphones,
	infinity: InfinityIcon,
	lock: Lock,
	device: MonitorSmartphone,
	star: Star,
	clock: Clock,
	wallet: Wallet,
}

/** Persian names of the automatic USDT rate sources (see core services/fx). */
export const FX_SOURCE_FA: Record<string, string> = {
	NOBITEX: "نوبیتکس",
	WALLEX: "والکس",
	BITPIN: "بیت‌پین",
	TETHERLAND: "تترلند",
	RAMZINEX: "رمزینکس",
	CUSTOM: "منبع اختصاصی",
	MANUAL: "نرخ دستی فروشنده",
}

export const UNLIMITED = "نامحدود"

export const currencyLabel = (c: string) => (!c || c === "IRT" || c === "IRR" || c === "TOMAN" ? "تومان" : c)

function linkOf(value: string, base: string): string {
	const v = value.trim()
	if (!v) return ""
	if (v.startsWith("http://") || v.startsWith("https://")) return v
	return base + v.replace(/^@/, "")
}

/** Normalized contact links so hero/footer render only what the seller filled. */
export function socialLinks(store: PublicStore) {
	const p = store.page
	return {
		support: store.supportUrl || store.brand.supportUrl || "",
		tg: linkOf(p.telegramChannel, "https://t.me/") || store.brand.telegramUrl || "",
		ig: linkOf(p.instagram, "https://instagram.com/"),
		wa: p.whatsapp.trim().startsWith("http") ? p.whatsapp.trim() : p.whatsapp.trim() ? "https://wa.me/" + p.whatsapp.replace(/[^0-9]/g, "") : "",
	}
}
