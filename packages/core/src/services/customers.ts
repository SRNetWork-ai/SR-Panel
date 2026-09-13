import { prisma, type Admin, type Customer, type CustomerWalletTx, type StoreSettings, type WalletTxKind } from "@srpanel/db"
import { z } from "zod"
import { hashPassword, verifyPassword } from "../security/password"
import { randomToken, sha256 } from "../security/token"
import { daysFromNow } from "../util/bytes"
import { AppError, NotFoundError } from "../util/errors"
import { audit } from "./audit"

/**
 * Storefront customer accounts + customer wallet.
 *
 * A Customer is an end buyer, not a panel Admin: it belongs to exactly one
 * seller (adminId), keeps its own session cookie (CustomerSession) and its own
 * wallet ledger (CustomerWalletTx). This module only depends on prisma and the
 * security helpers, so store.ts / payments.ts can import it without a cycle.
 */

export const CUSTOMER_SESSION_DAYS = 60
const SIGNUPS_PER_IP_PER_HOUR = 10

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/

const cleanEmail = (v?: string | null): string | null => (v ?? "").trim().toLowerCase().slice(0, 120) || null
const cleanDigits = (v?: string | null): string | null => (v ?? "").replace(/[^0-9]/g, "").slice(0, 20) || null
const cleanName = (v?: string | null): string | null => (v ?? "").trim().slice(0, 60) || null

export const customerSignupSchema = z.object({
	name: z.string().max(60).optional(),
	email: z.string().max(120).optional(),
	phone: z.string().max(24).optional(),
	telegramId: z.string().max(24).optional(),
	password: z.string().min(6, "رمز عبور باید حداقل ۶ کاراکتر باشد").max(72),
})
export type CustomerSignupInput = z.infer<typeof customerSignupSchema>

export const customerLoginSchema = z.object({
	/** email or phone number */
	identity: z.string().min(3).max(120),
	password: z.string().min(1).max(72),
})
export type CustomerLoginInput = z.infer<typeof customerLoginSchema>

export const customerProfileSchema = z.object({
	name: z.string().max(60).nullable().optional(),
	phone: z.string().max(24).nullable().optional(),
	telegramId: z.string().max(24).nullable().optional(),
})
export type CustomerProfileInput = z.infer<typeof customerProfileSchema>

export const customerPasswordSchema = z.object({
	current: z.string().min(1).max(72),
	next: z.string().min(6, "رمز عبور باید حداقل ۶ کاراکتر باشد").max(72),
})

export const customerTopupSchema = z.object({
	amount: z.number().int().min(1000).max(2_000_000_000),
	method: z.enum(["USDT", "CARD", "ZARINPAL"]),
})
export type CustomerTopupInput = z.infer<typeof customerTopupSchema>

export interface CustomerSessionMeta {
	ip?: string | null
	userAgent?: string | null
}

export interface CustomerDto {
	id: string
	name: string | null
	email: string | null
	phone: string | null
	telegramId: string | null
	credit: string
	status: Customer["status"]
	createdAt: string
	lastLoginAt: string | null
}

export interface CustomerListRow extends CustomerDto {
	orders: number
}

export interface CustomerWalletTxDto {
	id: string
	kind: WalletTxKind
	amount: string
	balanceAfter: string
	note: string | null
	refType: string | null
	refId: string | null
	createdAt: string
}

export interface CustomerOrderRow {
	token: string
	status: string
	amount: string
	planName: string | null
	createdAt: string
}

export interface CustomerServiceRow {
	name: string
	subToken: string
	status: string
	expiresAt: string | null
	trafficLimit: string
	used: string
}

export interface CustomerSummary {
	customer: CustomerDto
	orders: CustomerOrderRow[]
	services: CustomerServiceRow[]
	wallet: CustomerWalletTxDto[]
}

export const toCustomerDto = (c: Customer): CustomerDto => ({
	id: c.id,
	name: c.name,
	email: c.email,
	phone: c.phone,
	telegramId: c.telegramId,
	credit: c.credit.toString(),
	status: c.status,
	createdAt: c.createdAt.toISOString(),
	lastLoginAt: c.lastLoginAt?.toISOString() ?? null,
})

export const toCustomerWalletTxDto = (t: CustomerWalletTx): CustomerWalletTxDto => ({
	id: t.id,
	kind: t.kind,
	amount: t.amount.toString(),
	balanceAfter: t.balanceAfter.toString(),
	note: t.note,
	refType: t.refType,
	refId: t.refId,
	createdAt: t.createdAt.toISOString(),
})

async function startCustomerSession(customerId: string, meta: CustomerSessionMeta): Promise<string> {
	const token = randomToken(32)
	await prisma.customerSession.create({
		data: {
			customerId,
			tokenHash: sha256(token),
			ip: meta.ip ?? null,
			userAgent: meta.userAgent?.slice(0, 300) ?? null,
			expiresAt: daysFromNow(CUSTOMER_SESSION_DAYS),
		},
	})
	return token
}

/** Creates a storefront account and logs it straight in. */
export async function signupCustomer(s: StoreSettings, input: CustomerSignupInput, meta: CustomerSessionMeta = {}): Promise<{ token: string; customer: Customer }> {
	if (!s.accountsEnabled) throw new AppError("ثبت‌نام در این فروشگاه فعال نیست", 403, "accounts_disabled")
	const email = cleanEmail(input.email)
	const phone = cleanDigits(input.phone)
	const telegramId = cleanDigits(input.telegramId)
	if (email && !EMAIL_RE.test(email)) throw new AppError("ایمیل معتبر نیست")
	if (!email && !phone) throw new AppError("ایمیل یا شماره موبایل لازم است")
	if (s.requireEmail && !email) throw new AppError("ثبت ایمیل الزامی است")
	if (s.requirePhone && !phone) throw new AppError("ثبت شماره موبایل الزامی است")
	if (s.requireTelegram && !telegramId) throw new AppError("ثبت شناسه عددی تلگرام الزامی است")
	if (meta.ip) {
		const recent = await prisma.customerSession.count({ where: { ip: meta.ip, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } } })
		if (recent >= SIGNUPS_PER_IP_PER_HOUR) throw new AppError("تعداد درخواست‌ها از این آی‌پی زیاد است؛ کمی بعد تلاش کنید", 429, "rate_limited")
	}
	if (email && (await prisma.customer.findFirst({ where: { adminId: s.adminId, email } }))) throw new AppError("این ایمیل قبلاً ثبت شده است")
	if (phone && (await prisma.customer.findFirst({ where: { adminId: s.adminId, phone } }))) throw new AppError("این شماره موبایل قبلاً ثبت شده است")
	const customer = await prisma.customer.create({
		data: {
			adminId: s.adminId,
			name: cleanName(input.name),
			email,
			phone,
			telegramId,
			passwordHash: hashPassword(input.password),
			lastLoginAt: new Date(),
			lastLoginIp: meta.ip ?? null,
		},
	})
	const token = await startCustomerSession(customer.id, meta)
	await audit(s.adminId, "customer.signup", customer.id, { via: email ? "email" : "phone" }, meta.ip ?? null)
	return { token, customer }
}

export async function loginCustomer(s: StoreSettings, input: CustomerLoginInput, meta: CustomerSessionMeta = {}): Promise<{ token: string; customer: Customer }> {
	if (!s.accountsEnabled) throw new AppError("ورود مشتری در این فروشگاه فعال نیست", 403, "accounts_disabled")
	const identity = input.identity.trim()
	const email = identity.includes("@") ? cleanEmail(identity) : null
	const phone = identity.includes("@") ? null : cleanDigits(identity)
	const bad = new AppError("ایمیل/شماره یا رمز عبور درست نیست", 401, "bad_credentials")
	if (!email && !phone) throw bad
	const customer = await prisma.customer.findFirst({ where: { adminId: s.adminId, ...(email ? { email } : { phone }) } })
	if (!customer || !verifyPassword(input.password, customer.passwordHash)) {
		await audit(s.adminId, "customer.login_failed", identity.slice(0, 60), undefined, meta.ip ?? null)
		throw bad
	}
	if (customer.status !== "ACTIVE") throw new AppError("این حساب غیرفعال شده است؛ با پشتیبانی تماس بگیرید", 403, "blocked")
	const token = await startCustomerSession(customer.id, meta)
	await prisma.customer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date(), lastLoginIp: meta.ip ?? null } })
	await audit(s.adminId, "customer.login", customer.id, undefined, meta.ip ?? null)
	return { token, customer }
}

/** Resolves the storefront session cookie. Expired/blocked accounts return null. */
export async function customerFromToken(token: string | null | undefined): Promise<Customer | null> {
	if (!token) return null
	const session = await prisma.customerSession.findUnique({ where: { tokenHash: sha256(token) }, include: { customer: true } })
	if (!session || session.expiresAt.getTime() < Date.now()) return null
	if (session.customer.status !== "ACTIVE") return null
	return session.customer
}

export async function logoutCustomer(token: string): Promise<void> {
	await prisma.customerSession.deleteMany({ where: { tokenHash: sha256(token) } })
}

export async function logoutAllCustomerSessions(customerId: string): Promise<void> {
	await prisma.customerSession.deleteMany({ where: { customerId } })
}

export async function updateCustomerProfile(customer: Customer, input: CustomerProfileInput): Promise<Customer> {
	const data: { name?: string | null; phone?: string | null; telegramId?: string | null } = {}
	if (input.name !== undefined) data.name = cleanName(input.name)
	if (input.telegramId !== undefined) data.telegramId = cleanDigits(input.telegramId)
	if (input.phone !== undefined) {
		const phone = cleanDigits(input.phone)
		if (phone && phone !== customer.phone) {
			const clash = await prisma.customer.findFirst({ where: { adminId: customer.adminId, phone } })
			if (clash) throw new AppError("این شماره موبایل برای حساب دیگری ثبت شده است")
		}
		data.phone = phone
	}
	return prisma.customer.update({ where: { id: customer.id }, data })
}

export async function changeCustomerPassword(customer: Customer, current: string, next: string): Promise<void> {
	if (!verifyPassword(current, customer.passwordHash)) throw new AppError("رمز عبور فعلی درست نیست", 401, "bad_credentials")
	await prisma.customer.update({ where: { id: customer.id }, data: { passwordHash: hashPassword(next) } })
	await prisma.customerSession.deleteMany({ where: { customerId: customer.id } })
	await audit(customer.adminId, "customer.password_changed", customer.id)
}

// ---------------------------------------------------------------------------
// wallet
// ---------------------------------------------------------------------------

export interface CustomerWalletMove {
	customerId: string
	/** always positive; the ledger stores the sign */
	amount: bigint
	kind: WalletTxKind
	refType?: string | null
	refId?: string | null
	note?: string | null
	byAdminId?: string | null
}

/** Adds money to a customer wallet and writes the ledger row atomically. */
export async function creditCustomerWallet(p: CustomerWalletMove): Promise<{ balance: bigint; txId: string }> {
	if (p.amount <= 0n) throw new AppError("مبلغ نامعتبر است")
	return prisma.$transaction(async (tx) => {
		const c = await tx.customer.update({ where: { id: p.customerId }, data: { credit: { increment: p.amount } } })
		const row = await tx.customerWalletTx.create({
			data: { customerId: c.id, kind: p.kind, amount: p.amount, balanceAfter: c.credit, refType: p.refType ?? null, refId: p.refId ?? null, note: p.note ?? null, byAdminId: p.byAdminId ?? null },
		})
		return { balance: c.credit, txId: row.id }
	})
}

/** Takes money from a customer wallet. Throws when the balance is not enough. */
export async function debitCustomerWallet(p: CustomerWalletMove): Promise<{ balance: bigint; txId: string }> {
	if (p.amount <= 0n) throw new AppError("مبلغ نامعتبر است")
	return prisma.$transaction(async (tx) => {
		const current = await tx.customer.findUnique({ where: { id: p.customerId } })
		if (!current) throw new NotFoundError("حساب مشتری پیدا نشد")
		if (current.credit < p.amount) throw new AppError("موجودی کیف پول کافی نیست", 400, "insufficient_funds")
		const c = await tx.customer.update({ where: { id: p.customerId }, data: { credit: { decrement: p.amount } } })
		const row = await tx.customerWalletTx.create({
			data: { customerId: c.id, kind: p.kind, amount: -p.amount, balanceAfter: c.credit, refType: p.refType ?? null, refId: p.refId ?? null, note: p.note ?? null, byAdminId: p.byAdminId ?? null },
		})
		return { balance: c.credit, txId: row.id }
	})
}

export async function listCustomerWalletTxs(customerId: string, limit = 30): Promise<CustomerWalletTxDto[]> {
	const rows = await prisma.customerWalletTx.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 200) })
	return rows.map(toCustomerWalletTxDto)
}

/**
 * Credits a confirmed TOPUP payment to the customer wallet (plus the store
 * bonus percentage). Idempotent: the ledger row is keyed by the payment id.
 */
export async function settleCustomerTopup(paymentId: string): Promise<{ credited: boolean; balance: string | null }> {
	const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
	if (!payment || !payment.customerId || payment.kind !== "TOPUP" || payment.status !== "CONFIRMED") return { credited: false, balance: null }
	const already = await prisma.customerWalletTx.findFirst({ where: { refType: "payment", refId: payment.id } })
	if (already) return { credited: false, balance: already.balanceAfter.toString() }
	const store = await prisma.storeSettings.findUnique({ where: { adminId: payment.adminId } })
	const bonusPct = store?.topupBonusPct ?? 0
	const bonus = bonusPct > 0 ? (payment.amount * BigInt(bonusPct)) / 100n : 0n
	const note = bonus > 0n ? "شارژ کیف پول + " + bonusPct + "٪ هدیه" : "شارژ کیف پول"
	const { balance } = await creditCustomerWallet({ customerId: payment.customerId, amount: payment.amount + bonus, kind: "TOPUP", refType: "payment", refId: payment.id, note })
	await audit(payment.adminId, "customer.wallet_topup", payment.customerId, { amount: payment.amount.toString(), bonus: bonus.toString(), paymentId: payment.id })
	return { credited: true, balance: balance.toString() }
}

/** Everything the customer dashboard shows. */
export async function customerSummary(customerId: string): Promise<CustomerSummary> {
	const customer = await prisma.customer.findUnique({ where: { id: customerId } })
	if (!customer) throw new NotFoundError("حساب مشتری پیدا نشد")
	const [orders, clients, wallet] = await Promise.all([
		prisma.order.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 20 }),
		prisma.client.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 50 }),
		listCustomerWalletTxs(customerId, 20),
	])
	return {
		customer: toCustomerDto(customer),
		orders: orders.map((o) => {
			const snap = o.planSnapshot as unknown as { name?: string } | null
			return { token: o.token, status: o.status, amount: o.amount.toString(), planName: snap?.name ?? null, createdAt: o.createdAt.toISOString() }
		}),
		services: clients.map((c) => ({
			name: c.name,
			subToken: c.subToken,
			status: c.status,
			expiresAt: c.expiresAt?.toISOString() ?? null,
			trafficLimit: c.trafficLimit.toString(),
			used: (c.usedUp + c.usedDown).toString(),
		})),
		wallet,
	}
}

// ---------------------------------------------------------------------------
// admin side
// ---------------------------------------------------------------------------

async function customerForActor(actor: Admin, customerId: string): Promise<Customer> {
	const c = await prisma.customer.findUnique({ where: { id: customerId } })
	if (!c) throw new NotFoundError("مشتری پیدا نشد")
	if (actor.role !== "OWNER" && c.adminId !== actor.id) throw new AppError("به این مشتری دسترسی ندارید", 403, "forbidden")
	return c
}

export async function listCustomers(actor: Admin, opts: { q?: string | null; adminId?: string | null; limit?: number } = {}): Promise<CustomerListRow[]> {
	const scope = actor.role === "OWNER" ? (opts.adminId ? { adminId: opts.adminId } : {}) : { adminId: actor.id }
	const q = (opts.q ?? "").trim()
	const search = q
		? {
				OR: [
					{ name: { contains: q, mode: "insensitive" as const } },
					{ email: { contains: q, mode: "insensitive" as const } },
					{ phone: { contains: q } },
					{ telegramId: { contains: q } },
				],
			}
		: {}
	const rows = await prisma.customer.findMany({
		where: { ...scope, ...search },
		orderBy: { createdAt: "desc" },
		take: Math.min(Math.max(opts.limit ?? 50, 1), 200),
		include: { _count: { select: { orders: true } } },
	})
	return rows.map((c) => ({ ...toCustomerDto(c), orders: c._count.orders }))
}

/** Manual credit adjustment by the seller (positive = add, negative = remove). */
export async function adjustCustomerCredit(actor: Admin, customerId: string, amount: bigint, note?: string | null): Promise<{ balance: string }> {
	const customer = await customerForActor(actor, customerId)
	if (amount === 0n) throw new AppError("مبلغ نامعتبر است")
	const move: CustomerWalletMove = { customerId: customer.id, amount: amount > 0n ? amount : -amount, kind: "ADJUST", refType: "admin", refId: actor.id, note: note ?? null, byAdminId: actor.id }
	const res = amount > 0n ? await creditCustomerWallet(move) : await debitCustomerWallet(move)
	await audit(actor.id, "customer.credit_adjust", customer.id, { amount: amount.toString(), balance: res.balance.toString() })
	return { balance: res.balance.toString() }
}

export async function setCustomerStatus(actor: Admin, customerId: string, status: "ACTIVE" | "BLOCKED"): Promise<CustomerDto> {
	const customer = await customerForActor(actor, customerId)
	const saved = await prisma.customer.update({ where: { id: customer.id }, data: { status } })
	if (status === "BLOCKED") await prisma.customerSession.deleteMany({ where: { customerId: customer.id } })
	await audit(actor.id, "customer.status", customer.id, { status })
	return toCustomerDto(saved)
}

export async function resetCustomerPassword(actor: Admin, customerId: string, password: string): Promise<void> {
	const customer = await customerForActor(actor, customerId)
	if (password.length < 6) throw new AppError("رمز عبور باید حداقل ۶ کاراکتر باشد")
	await prisma.customer.update({ where: { id: customer.id }, data: { passwordHash: hashPassword(password) } })
	await prisma.customerSession.deleteMany({ where: { customerId: customer.id } })
	await audit(actor.id, "customer.password_reset", customer.id)
}
