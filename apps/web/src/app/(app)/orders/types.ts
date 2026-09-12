/* shared types + tones for the orders screens (mirror API DTOs) */
export type OrderStatus = "PENDING" | "PAID" | "FULFILLED" | "CANCELED" | "EXPIRED"
export type PayStatus = "PENDING" | "REVIEW" | "CONFIRMED" | "REJECTED" | "EXPIRED"
export type PayMethod = "USDT" | "CARD" | "ZARINPAL" | "WALLET" | "MANUAL"

export type OrderRow = {
	id: string
	token: string
	status: OrderStatus
	amount: number
	listPrice: number
	discountCode: string | null
	discountAmount: number
	customerName: string | null
	customerTelegramId: string | null
	customerPhone: string | null
	error: string | null
	createdAt: string
	fulfilledAt: string | null
	renewClientId: string | null
	plan: { name: string } | null
	client: { id: string; name: string } | null
	admin?: { username: string }
	payments: Array<{ id: string; method: string; status: string; txid: string | null; receiptRef: string | null; receiptFile: string | null }>
}

export type PaymentRow = {
	id: string
	kind: "ORDER" | "TOPUP"
	method: PayMethod
	status: PayStatus
	amount: number
	amountUsdt: string | null
	txid: string | null
	receiptRef: string | null
	receiptFile: string | null
	cardPan: string | null
	refId: string | null
	reviewNote: string | null
	error: string | null
	createdAt: string
	admin: { username: string; displayName: string | null }
	order: { id: string; token: string; status: string; customerName: string | null; customerTelegramId: string | null; planSnapshot: { name?: string } | null } | null
}

export type List<T> = { items: T[]; total: number }

type Tone = "success" | "warning" | "danger" | "muted" | "violet" | "cyan"
export const ORDER_TONE: Record<string, Tone> = { PENDING: "warning", PAID: "cyan", FULFILLED: "success", CANCELED: "muted", EXPIRED: "danger" }
export const PAY_TONE: Record<string, Tone> = { PENDING: "muted", REVIEW: "warning", CONFIRMED: "success", REJECTED: "danger", EXPIRED: "muted" }
export const ORDER_STATUSES: OrderStatus[] = ["PENDING", "PAID", "FULFILLED", "CANCELED", "EXPIRED"]
export const PAY_STATUSES: PayStatus[] = ["REVIEW", "PENDING", "CONFIRMED", "REJECTED", "EXPIRED"]

/** TRON explorer link for a USDT transaction hash */
export const tronTxUrl = (txid: string) => "https://tronscan.org/#/transaction/" + txid

/** tiny bilingual helper so new labels do not need new dictionary keys */
export const tr = (locale: string, fa: string, en: string) => (locale === "en" ? en : fa)
