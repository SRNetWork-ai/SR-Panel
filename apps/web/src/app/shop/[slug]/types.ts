import { Clock, CreditCard, Globe, Headphones, Infinity as InfinityIcon, Landmark, Lock, MonitorSmartphone, ShieldCheck, Star, Wallet, Zap } from "lucide-react"

/**
 * Shared DTOs + labels for the public storefront (`/shop/[slug]`).
 *
 * Mirrors `publicStorePayload()` of @srpanel/core, but is kept local so the
 * client bundle never imports server-only code.
 */

export type Method = "USDT" | "CARD" | "ZARINPAL" | "WALLET"

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

/** Account & wallet capabilities of the storefront. */
export type StoreAccounts = {
	enabled: boolean
	guestCheckout: boolean
	walletEnabled: boolean
	minTopup: string
	topupBonusPct: number
	requireEmail: boolean
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
	accounts: StoreAccounts
	announcement: string | null
	termsUrl: string | null
	page: StorePage
	stats: { plans: number; locations: number; sold: number }
	plans: PublicPlan[]
}

/* ---------- catalogue: categories + extended plan options ---------- */

/** Mirror of core `PublicCategory`; icons are shared with the page builder. */
export type ShopCategory = {
	id: string
	name: string
	description: string
	icon: StorePageIcon
	count: number
}

/** Mirror of core `PublicPlanOptions`. */
export type ShopPlanOptions = {
	categoryId: string
	ribbon: string
	highlight: boolean
	features: string[]
	note: string
	/** null = unlimited stock */
	stockLeft: number | null
	soldOut: boolean
	perCustomer: number
}

export type ShopCatalog = {
	enabled: boolean
	showCounts: boolean
	categories: ShopCategory[]
	items: Record<string, ShopPlanOptions>
	/** plans reachable only through `?plan=<id>` */
	hidden: string[]
}

export const EMPTY_CATALOG: ShopCatalog = { enabled: false, showCounts: true, categories: [], items: {}, hidden: [] }

export const EMPTY_PLAN_OPTIONS: ShopPlanOptions = { categoryId: "", ribbon: "", highlight: false, features: [], note: "", stockLeft: null, soldOut: false, perCustomer: 0 }

/** Options of a single plan with neutral fallbacks, so cards render unconditionally. */
export const planOptions = (catalog: ShopCatalog | undefined, planId: string): ShopPlanOptions => catalog?.items[planId] ?? EMPTY_PLAN_OPTIONS

/** Public plan list: hidden plans stay out unless one of them is selected. */
export function visiblePlans(plans: PublicPlan[], catalog: ShopCatalog | undefined, keepId?: string | null): PublicPlan[] {
	if (!catalog || !catalog.enabled || catalog.hidden.length === 0) return plans
	const hidden = new Set(catalog.hidden)
	return plans.filter((p) => !hidden.has(p.id) || p.id === keepId)
}

/* ---------- storefront account (session of the buyer) ---------- */

export type CustomerProfile = {
	id: string
	name: string | null
	email: string | null
	phone: string | null
	telegramId: string | null
	credit: string
	status: "ACTIVE" | "BLOCKED"
	createdAt: string
	lastLoginAt: string | null
}

export type WalletTxRow = {
	id: string
	kind: "TOPUP" | "PURCHASE" | "REFUND" | "ADJUST"
	amount: string
	balanceAfter: string
	note: string | null
	refType: string | null
	refId: string | null
	createdAt: string
}

export type CustomerOrderRow = {
	token: string
	status: string
	amount: string
	planName: string | null
	createdAt: string
}

export type CustomerServiceRow = {
	name: string
	subToken: string
	status: string
	expiresAt: string | null
	trafficLimit: string
	used: string
}

export type CustomerMe = {
	customer: CustomerProfile
	orders: CustomerOrderRow[]
	services: CustomerServiceRow[]
	wallet: WalletTxRow[]
}

export const WALLET_KIND_FA: Record<WalletTxRow["kind"], string> = {
	TOPUP: "شارژ کیف پول",
	PURCHASE: "خرید",
	REFUND: "برگشت وجه",
	ADJUST: "اصلاح دستی",
}

export const ORDER_STATUS_FA: Record<string, string> = {
	PENDING: "در انتظار پرداخت",
	PAID: "پرداخت شده",
	FULFILLED: "تحویل شده",
	CANCELED: "لغو شده",
	EXPIRED: "منقضی شده",
}

export const METHOD_META: Record<Method, { label: string; hint: string; icon: typeof CreditCard }> = {
	WALLET: { label: "کیف پول من", hint: "پرداخت از موجودی حساب — تحویل فوری", icon: Wallet },
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
