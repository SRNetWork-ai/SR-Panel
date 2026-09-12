/* shared types + constants for the store screens (mirror API DTOs) */
export type Method = "USDT" | "CARD" | "ZARINPAL"
export type Tab = "overview" | "plans" | "discounts" | "settings"

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

export type Target = { serverId: string; inboundId: number }

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
	targets: Target[]
	isActive: boolean
	sortOrder: number
	sold: number
	cost: number
	admin?: { username: string }
}

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

export const ORDER_TONE: Record<string, "success" | "warning" | "danger" | "muted" | "violet" | "cyan"> = { PENDING: "warning", PAID: "cyan", FULFILLED: "success", CANCELED: "muted", EXPIRED: "danger" }
export const ORDER_STATUSES = ["PENDING", "PAID", "FULFILLED", "CANCELED", "EXPIRED"]
export const TRAFFIC_PRESETS = [10, 30, 50, 100, 200, 500, 0]
export const DAY_PRESETS = [7, 30, 60, 90, 180, 365, 0]

/** tiny bilingual helper so new labels do not need new dictionary keys */
export const tr = (locale: string, fa: string, en: string) => (locale === "en" ? en : fa)
