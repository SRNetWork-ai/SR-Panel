/* shared types + tones for the wallet screens (mirror API DTOs) */
export type Method = "USDT" | "CARD" | "ZARINPAL"
export type TxKind = "TOPUP" | "PURCHASE" | "REFUND" | "ADJUST"
export type PayStatus = "PENDING" | "REVIEW" | "CONFIRMED" | "REJECTED" | "EXPIRED"

export type Tx = {
	id: string
	kind: TxKind
	amount: number
	balanceAfter: number
	refType: string | null
	refId: string | null
	note: string | null
	createdAt: string
}

export type Topup = {
	id: string
	method: Method | "WALLET" | "MANUAL"
	status: PayStatus
	amount: number
	amountUsdt: string | null
	txid: string | null
	receiptRef: string | null
	reviewNote: string | null
	createdAt: string
	expiresAt: string | null
}

export type Next =
	| { type: "usdt"; address: string; network: string; amountUsdt: string; rate: number }
	| { type: "card"; cardNumber: string; cardHolder: string | null; cardBank: string | null }
	| { type: "redirect"; url: string }
	| { type: "review" }
	| { type: "done" }
	| { type: "none" }

/** quota / limits of the signed-in reseller (null for the owner) */
export type Limits = {
	trafficQuota: number | null
	allocated: number
	remaining: number | null
	clientLimit: number | null
	clients: number
	clientsRemaining: number | null
	expiresAt: string | null
	expired: boolean
}

export type Overview = {
	balance: number
	unit: { perGB: number; perDay: number; billingEnabled: boolean }
	recent: Tx[]
	pendingTopups: number
	spent30d: number
	creditLimit: number
	lowBalance: number
	chargeOnRenew: boolean
	limits: Limits | null
	topupMethods: Method[]
	isOwner: boolean
}

/** pricing + refund policy (two Setting keys, one owner form) */
export type Pricing = {
	billingEnabled: boolean
	pricePerGB: number
	pricePerDay: number
	chargeOnRenew: boolean
	creditLimit: number
	lowBalance: number
	refundEnabled: boolean
	refundPercent: number
	refundMin: number
}

export type Reseller = {
	id: string
	username: string
	displayName: string | null
	isActive: boolean
	balance: number
	pricePerGB: number | null
	pricePerDay: number | null
	clients: number
	spent30d: number
}

/** reseller packages — traffic / days / client slots a reseller buys for itself */
export type ResellerPlanDto = {
	id: string
	name: string
	description: string
	gb: number
	days: number
	clients: number
	price: number
	isActive: boolean
	sortOrder: number
	adminIds: string[]
}

export type PlansPayload = { isOwner: boolean; enabled: boolean; plans: ResellerPlanDto[] }

export type PlanPurchase = {
	charged: number
	balance: number
	trafficQuota: number | null
	clientLimit: number | null
	expiresAt: string | null
}

type Tone = "success" | "warning" | "danger" | "muted" | "violet" | "cyan"
export const KIND_TONE: Record<TxKind, Tone> = { TOPUP: "success", PURCHASE: "violet", REFUND: "cyan", ADJUST: "warning" }
export const PAY_TONE: Record<string, Tone> = { PENDING: "muted", REVIEW: "warning", CONFIRMED: "success", REJECTED: "danger", EXPIRED: "muted" }
export const TX_KINDS: TxKind[] = ["TOPUP", "PURCHASE", "REFUND", "ADJUST"]
export const TOPUP_STATUSES: PayStatus[] = ["REVIEW", "PENDING", "CONFIRMED", "REJECTED", "EXPIRED"]
export const AMOUNT_PRESETS = [200_000, 500_000, 1_000_000, 2_000_000, 5_000_000]

/** tiny bilingual helper so new labels do not need new dictionary keys */
export const tr = (locale: string, fa: string, en: string) => (locale === "en" ? en : fa)
