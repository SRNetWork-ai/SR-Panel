import { prisma, type Customer, type Payment, type PaymentMethod } from "@srpanel/db"
import { AppError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { beginPayment, type PaymentNext } from "./payments"
import { enabledMethods } from "./storeSettings"

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
