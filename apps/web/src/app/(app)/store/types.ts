/* shared types + constants for the store screens (mirror API DTOs) */
export type Method = "USDT" | "CARD" | "ZARINPAL"
export type Tab = "overview" | "plans" | "payments" | "discounts" | "settings"

export type StoreSettings = {
	id: string
	enabled: boolean
	slug: string
	title: string | null
	description: string | null
	rules: string | null
	supportUrl: string | null
	currency: string
	usdtEnabled: boolean
	usdtAddress: string | null
	usdtNetwork: string
	usdtRate: number
	usdtAutoVerify: boolean
	cardEnabled: boolean
	cardNumber: string | null
	cardHolder: string | null
	cardBank: string | null
	zarinpalEnabled: boolean
	zarinpalSandbox: boolean
	hasZarinpal: boolean
	zarinpalMerchantMasked: string
	requireTelegram: boolean
	requirePhone: boolean
	paymentTtlMin: number
	url: string
	methods: Method[]
}

export type Target = { serverId: string; inboundId: number; serviceId?: string }

export type Plan = {
	id: string
	name: string
	description: string | null
	badge: string | null
	trafficGB: number
	days: number
	ipLimit: number
	price: number
	oldPrice: number | null
	/** the service this plan sells (null = legacy hand-picked inbounds) */
	serviceId: string | null
	serviceName: string | null
	serviceActive: boolean | null
	targets: Target[]
	isActive: boolean
	sortOrder: number
	sold: number
	cost: number
	admin?: { username: string }
}

/** editable shape used by the plan modal */
export type PlanDraft = {
	name: string
	description: string
	badge: string
	trafficGB: number
	days: number
	ipLimit: number
	price: number
	oldPrice: number | null
	serviceId: string | null
	targets: Target[]
	isActive: boolean
	sortOrder: number
}

export const emptyPlanDraft = (): PlanDraft => ({ name: "", description: "", badge: "", trafficGB: 50, days: 30, ipLimit: 0, price: 0, oldPrice: null, serviceId: null, targets: [], isActive: true, sortOrder: 0 })

export const planDraft = (p: Plan): PlanDraft => ({
	name: p.name,
	description: p.description ?? "",
	badge: p.badge ?? "",
	trafficGB: p.trafficGB,
	days: p.days,
	ipLimit: p.ipLimit,
	price: p.price,
	oldPrice: p.oldPrice,
	serviceId: p.serviceId,
	targets: p.targets,
	isActive: p.isActive,
	sortOrder: p.sortOrder,
})

export type ServiceTarget = { serverId: string; inboundId: number; serverName: string; inboundLabel: string; enabled: boolean }
export type ServiceOption = { id: string; name: string; description: string | null; isActive: boolean; sortOrder: number; targets: ServiceTarget[] }

export type Discount = { id: string; code: string; percent: number; amount: number; maxUses: number | null; uses: number; expiresAt: string | null; isActive: boolean }

export type ServerDto = { id: string; name: string; inbounds: Array<{ id: number; remark?: string; protocol?: string; port?: number }> }

export type Overview = {
	enabled: boolean
	slug: string | null
	url: string | null
	methods: Method[]
	counts: Record<string, number>
	revenue30d: number
	pendingReview: number
	activePlans: number
	recent: Array<{ id: string; status: string; amount: number; customerName: string | null; customerTelegramId: string | null; createdAt: string; plan: { name: string } | null }>
}

/* ---------- automatic USDT pricing ---------- */
export type FxSource = "NOBITEX" | "WALLEX" | "BITPIN" | "TETHERLAND" | "RAMZINEX" | "CUSTOM"

export type FxDto = {
	mode: "MANUAL" | "AUTO"
	sources: FxSource[]
	marginPct: number
	roundTo: number
	ttlMin: number
	minRate: number
	maxRate: number
	customUrl: string
	customPath: string
	customUnit: "IRT" | "IRR"
	cacheRate: number
	cacheAt: string
	cacheSource: string
	lastError: string
	fresh: boolean
}

export type FxAttempt = { source: FxSource; ok: boolean; rate?: number; error?: string }
export type FxResult = { rate: number; source: string; at: string; attempts: FxAttempt[]; saved: boolean; stale?: boolean; error?: string | null }

export const FX_SOURCE_LIST: FxSource[] = ["NOBITEX", "WALLEX", "BITPIN", "TETHERLAND", "RAMZINEX", "CUSTOM"]

export const FX_SOURCE_LABEL: Record<FxSource, { fa: string; en: string }> = {
	NOBITEX: { fa: "نوبیتکس", en: "Nobitex" },
	WALLEX: { fa: "والکس", en: "Wallex" },
	BITPIN: { fa: "بیت‌پین", en: "Bitpin" },
	TETHERLAND: { fa: "تترلند", en: "Tetherland" },
	RAMZINEX: { fa: "رمزینکس", en: "Ramzinex" },
	CUSTOM: { fa: "API سفارشی", en: "Custom API" },
}

/* ---------- card-to-card auto verification ---------- */
export type CardVerifyMode = "MANUAL" | "SMS" | "BANK"
export type BankProvider = "NONE" | "HAMRAHBANK" | "CUSTOM"
export type DepositStatus = "MATCHED" | "UNMATCHED" | "AMBIGUOUS" | "DUPLICATE" | "IGNORED"

export type DepositDto = {
	id: string
	at: string
	amount: number
	refId: string
	last4: string
	sender: string
	raw: string
	source: "SMS" | "BANK" | "MANUAL"
	status: DepositStatus
	paymentId: string
	note: string
}

export type CardDto = {
	mode: CardVerifyMode
	autoConfirm: boolean
	uniqueAmount: boolean
	windowMin: number
	toleranceIrt: number
	requireLast4: boolean
	smsToken: string
	senders: string[]
	bankProvider: BankProvider
	bankApiUrl: string
	bankUsername: string
	bankCard: string
	bankPollMin: number
	bankLastSyncAt: string
	lastError: string
	deposits: DepositDto[]
	hasBankSecret: boolean
	webhookUrl: string
}

export type BankSyncResult = { ok: boolean; fetched: number; imported: number; matched: number; error: string | null }

export const CARD_MODE_LABEL: Record<CardVerifyMode, { fa: string; en: string }> = {
	MANUAL: { fa: "تأیید دستی", en: "Manual" },
	SMS: { fa: "پیامک واریز بانک", en: "Bank SMS" },
	BANK: { fa: "اتصال به بانک", en: "Bank connection" },
}

export const BANK_LABEL: Record<BankProvider, { fa: string; en: string }> = {
	NONE: { fa: "غیرفعال", en: "Off" },
	HAMRAHBANK: { fa: "همراه‌بانک (پل واسط)", en: "Hamrah Bank (bridge)" },
	CUSTOM: { fa: "API سفارشی", en: "Custom API" },
}

export const DEPOSIT_LABEL: Record<DepositStatus, { fa: string; en: string }> = {
	MATCHED: { fa: "تأیید شد", en: "Confirmed" },
	UNMATCHED: { fa: "بدون تطبیق", en: "Unmatched" },
	AMBIGUOUS: { fa: "چند سفارش مشابه", en: "Ambiguous" },
	DUPLICATE: { fa: "تکراری", en: "Duplicate" },
	IGNORED: { fa: "نادیده", en: "Ignored" },
}

export const DEPOSIT_TONE: Record<DepositStatus, "success" | "warning" | "danger" | "muted" | "cyan"> = {
	MATCHED: "success",
	UNMATCHED: "warning",
	AMBIGUOUS: "danger",
	DUPLICATE: "muted",
	IGNORED: "muted",
}

/* ---------- editable storefront content ---------- */
export type StorePageIcon = "shield" | "bolt" | "globe" | "headset" | "infinity" | "lock" | "device" | "star" | "clock" | "wallet"
export const PAGE_ICONS: StorePageIcon[] = ["shield", "bolt", "globe", "headset", "infinity", "lock", "device", "star", "clock", "wallet"]

export type PageCard = { icon: StorePageIcon; title: string; text: string }
export type PageStep = { title: string; text: string }
export type PageFaq = { q: string; a: string }

export type PageDto = {
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
	features: PageCard[]
	steps: PageStep[]
	faq: PageFaq[]
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

export type StoreExtras = { fx: FxDto; card: CardDto; page: PageDto }

export const ORDER_TONE: Record<string, "success" | "warning" | "danger" | "muted" | "violet" | "cyan"> = { PENDING: "warning", PAID: "cyan", FULFILLED: "success", CANCELED: "muted", EXPIRED: "danger" }
export const ORDER_STATUSES = ["PENDING", "PAID", "FULFILLED", "CANCELED", "EXPIRED"]
export const TRAFFIC_PRESETS = [10, 30, 50, 100, 200, 500, 0]
export const DAY_PRESETS = [7, 30, 60, 90, 180, 365, 0]

/** tiny bilingual helper so new labels do not need new dictionary keys */
export const tr = (locale: string, fa: string, en: string) => (locale === "en" ? en : fa)
