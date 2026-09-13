import { prisma, type Customer, type Payment, type PaymentMethod, type StoreSettings } from "@srpanel/db"
import { AppError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { beginPayment, paymentNext, submitProof, type PaymentNext, type PaymentProof } from "./payments"
import { enabledMethods, storeSettingsByAdminId } from "./storeSettings"

/**
 * Storefront money flows that need both the payment gateways and the customer
 * wallet. Kept in its own module so ./customers stays dependency-free.
 */

const MIN_TOPUP = 1000n

/** Methods a customer may use to top up (only when the seller enabled the wallet). */
export async function customerTopupMethods(adminId: string): Promise<PaymentMethod[]> {
	const s = await prisma.storeSettings.findUnique({ where: { adminId } })
	if (!s || !s.enabled || !s.walletEnabled) return []
	return enabledMethods(s)
}

export async function createCustomerTopup(customer: Customer, input: { amount: number; method: PaymentMethod; assetId?: string | null }): Promise<{ payment: Payment; next: PaymentNext }> {
	const s = await prisma.storeSettings.findUnique({ where: { adminId: customer.adminId } })
	if (!s || !s.enabled) throw new NotFoundError("فروشگاه فعال نیست")
	if (!s.walletEnabled) throw new AppError("کیف پول در این فروشگاه فعال نیست", 403, "wallet_disabled")
	const amount = BigInt(Math.round(input.amount))
	const min = s.minTopup > 0n ? s.minTopup : MIN_TOPUP
	if (amount < min) throw new AppError("حداقل مبلغ شارژ " + min.toString() + " تومان است")
	if (!enabledMethods(s).includes(input.method)) throw new AppError("این روش پرداخت فعال نیست")
	const who = customer.name || customer.email || customer.phone || customer.id
	const r = await beginPayment(s, {
		kind: "TOPUP",
		method: input.method,
		amount,
		adminId: customer.adminId,
		description: "شارژ کیف پول — " + who,
		mobile: customer.phone,
		email: customer.email,
		assetId: input.assetId ?? null,
	})
	// beginPayment does not know about customers, so the row is tagged right after
	const payment = await prisma.payment.update({ where: { id: r.payment.id }, data: { customerId: customer.id } })
	await audit(customer.adminId, "customer.topup_request", payment.id, { customerId: customer.id, amount: amount.toString(), method: input.method })
	return { payment, next: r.next }
}

/** Attaches an order that was placed while logged in to the account. */
export async function attachCustomerToOrder(orderToken: string, customer: Customer): Promise<void> {
	const order = await prisma.order.findUnique({ where: { token: orderToken }, select: { id: true, adminId: true, customerId: true } })
	if (!order || order.adminId !== customer.adminId || order.customerId) return
	await prisma.order.update({ where: { id: order.id }, data: { customerId: customer.id } })
}

/** Points the subscriptions bought through the account at the account (self-healing). */
export async function linkCustomerClients(customerId: string): Promise<number> {
	const orders = await prisma.order.findMany({ where: { customerId, clientId: { not: null } }, select: { clientId: true } })
	const ids = [...new Set(orders.map((o) => o.clientId).filter((x): x is string => !!x))]
	if (!ids.length) return 0
	const r = await prisma.client.updateMany({ where: { id: { in: ids }, customerId: null }, data: { customerId } })
	return r.count
}

// ---------------------------------------------------------------------------
// top-up tracking (the buyer finishes a card/crypto payment on the shop page)
// ---------------------------------------------------------------------------

export interface CustomerPaymentView {
	id: string
	kind: Payment["kind"]
	method: PaymentMethod
	status: Payment["status"]
	amount: string
	amountUsdt: string | null
	expiresAt: string | null
	createdAt: string
	error: string | null
	reviewNote: string | null
	next: PaymentNext
}

function toCustomerPaymentView(p: Payment, s: StoreSettings | null): CustomerPaymentView {
	return {
		id: p.id,
		kind: p.kind,
		method: p.method,
		status: p.status,
		amount: p.amount.toString(),
		amountUsdt: p.amountUsdt,
		expiresAt: p.expiresAt?.toISOString() ?? null,
		createdAt: p.createdAt.toISOString(),
		error: p.error,
		reviewNote: p.reviewNote,
		next: paymentNext(p, s),
	}
}

async function ownPayment(customer: Customer, paymentId: string): Promise<Payment> {
	const p = await prisma.payment.findUnique({ where: { id: paymentId } })
	if (!p || p.customerId !== customer.id) throw new NotFoundError("پرداخت پیدا نشد")
	return p
}

/** Status + payment instructions of one of the customer's own payments. */
export async function customerPaymentView(customer: Customer, paymentId: string): Promise<CustomerPaymentView> {
	const p = await ownPayment(customer, paymentId)
	return toCustomerPaymentView(p, await storeSettingsByAdminId(p.adminId))
}

/** Open (payable or under review) wallet top-ups of this customer. */
export async function listCustomerTopups(customer: Customer, limit = 5): Promise<CustomerPaymentView[]> {
	const rows = await prisma.payment.findMany({
		where: { customerId: customer.id, kind: "TOPUP", status: { in: ["PENDING", "REVIEW"] } },
		orderBy: { createdAt: "desc" },
		take: Math.min(Math.max(limit, 1), 20),
	})
	if (!rows.length) return []
	const s = await storeSettingsByAdminId(customer.adminId)
	return rows.map((p) => toCustomerPaymentView(p, s))
}

/** TXID / receipt reference for a top-up the customer paid. */
export async function submitCustomerProof(customer: Customer, paymentId: string, proof: PaymentProof): Promise<CustomerPaymentView> {
	const p = await ownPayment(customer, paymentId)
	const saved = await submitProof(p.id, proof)
	return toCustomerPaymentView(saved, await storeSettingsByAdminId(saved.adminId))
}
