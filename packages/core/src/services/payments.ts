import { prisma, type Admin, type Order, type Payment, type PaymentKind, type PaymentMethod, type StoreSettings } from "@srpanel/db"
import { shortId } from "../security/token"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { createClient, resetClientTraffic, subscriptionUrl, updateClient } from "./clients"
import { fmtDate, notify } from "./notifications"
import { planTargets } from "./plans"
import { brandName, getTelegramSettings, panelUrl } from "./settings"
import { storeSettingsByAdminId, enabledMethods, merchantOf } from "./storeSettings"
import { tgEscape, tgSendMessage } from "./telegram"
import { verifyTrc20Payment } from "./tron"
import { chargeWallet } from "./wallet"
import { emitEvent } from "./webhooks"
import { zarinpalRequest, zarinpalVerify } from "./zarinpal"

export type PaymentNext =
	| { type: "usdt"; address: string; network: string; amountUsdt: string; rate: number }
	| { type: "card"; cardNumber: string; cardHolder: string | null; cardBank: string | null }
	| { type: "redirect"; url: string }
	| { type: "review" }
	| { type: "done" }
	| { type: "none" }

export interface PlanSnapshot {
	name: string
	trafficGB: number
	days: number
	ipLimit: number
	targets: Array<{ serverId: string; inboundId: number }>
}

const fmtIrt = (n: bigint | number) => Number(n).toLocaleString("en-US")

export function usdtAmountFor(amountIrt: bigint, rate: number): string {
	if (rate <= 0) return "0"
	const v = Number(amountIrt) / rate
	return Math.max(0.01, Math.ceil(v * 100) / 100).toFixed(2)
}

export interface BeginPaymentInput {
	kind: PaymentKind
	method: PaymentMethod
	amount: bigint
	/** ORDER: seller admin id — TOPUP: admin whose wallet is credited */
	adminId: string
	orderId?: string | null
	description: string
	mobile?: string | null
	email?: string | null
}

export async function beginPayment(s: StoreSettings, input: BeginPaymentInput): Promise<{ payment: Payment; next: PaymentNext }> {
	if (!enabledMethods(s).includes(input.method)) throw new AppError("این روش پرداخت فعال نیست")
	if (input.amount <= 0n) throw new AppError("مبلغ نامعتبر است")
	const expiresAt = new Date(Date.now() + s.paymentTtlMin * 60_000)
	const base = { kind: input.kind, method: input.method, amount: input.amount, adminId: input.adminId, orderId: input.orderId ?? null, expiresAt }
	if (input.method === "USDT") {
		const amountUsdt = usdtAmountFor(input.amount, s.usdtRate)
		const payment = await prisma.payment.create({ data: { ...base, amountUsdt } })
		return { payment, next: { type: "usdt", address: s.usdtAddress!, network: s.usdtNetwork, amountUsdt, rate: s.usdtRate } }
	}
	if (input.method === "CARD") {
		const payment = await prisma.payment.create({ data: base })
		return { payment, next: { type: "card", cardNumber: s.cardNumber!, cardHolder: s.cardHolder, cardBank: s.cardBank } }
	}
	if (input.method === "ZARINPAL") {
		const merchant = merchantOf(s)
		if (!merchant) throw new AppError("مرچنت زرین‌پال تنظیم نشده است")
		const payment = await prisma.payment.create({ data: base })
		const r = await zarinpalRequest({
			merchantId: merchant,
			amount: Number(input.amount),
			description: input.description,
			callbackUrl: `${panelUrl()}/api/shop/zarinpal/callback?p=${payment.id}`,
			sandbox: s.zarinpalSandbox,
			mobile: input.mobile ?? null,
			email: input.email ?? null,
		})
		if (!r.ok) {
			await prisma.payment.update({ where: { id: payment.id }, data: { status: "REJECTED", error: r.error } })
			throw new AppError(`اتصال به زرین‌پال ناموفق بود: ${r.error}`, 502, "gateway")
		}
		const updated = await prisma.payment.update({ where: { id: payment.id }, data: { authority: r.authority, meta: { startUrl: r.url } } })
		return { payment: updated, next: { type: "redirect", url: r.url } }
	}
	throw new AppError("روش پرداخت پشتیبانی نمی‌شود")
}

/** Instructions for a payment based on its current state (used by polling pages). */
export function paymentNext(p: Payment, s: StoreSettings | null): PaymentNext {
	if (p.status === "CONFIRMED") return { type: "done" }
	if (p.status === "REVIEW") return { type: "review" }
	if (p.status !== "PENDING") return { type: "none" }
	if (p.expiresAt && p.expiresAt.getTime() < Date.now()) return { type: "none" }
	if (p.method === "USDT" && s?.usdtAddress) return { type: "usdt", address: s.usdtAddress, network: s.usdtNetwork, amountUsdt: p.amountUsdt ?? usdtAmountFor(p.amount, s.usdtRate), rate: s.usdtRate }
	if (p.method === "CARD" && s?.cardNumber) return { type: "card", cardNumber: s.cardNumber, cardHolder: s.cardHolder, cardBank: s.cardBank }
	if (p.method === "ZARINPAL") {
		const url = (p.meta as { startUrl?: string } | null)?.startUrl
		if (url) return { type: "redirect", url }
	}
	return { type: "none" }
}

export async function ownerAdmin(): Promise<Admin> {
	const o = await prisma.admin.findFirst({ where: { role: "OWNER" }, orderBy: { createdAt: "asc" } })
	if (!o) throw new AppError("مالک پنل پیدا نشد", 500)
	return o
}

/** Settings that govern a payment: seller's for ORDER, owner's for TOPUP */
export async function settingsForPayment(p: Pick<Payment, "kind" | "adminId">): Promise<StoreSettings | null> {
	if (p.kind === "ORDER") return storeSettingsByAdminId(p.adminId)
	const owner = await ownerAdmin()
	return storeSettingsByAdminId(owner.id)
}

async function reviewerId(p: Pick<Payment, "kind" | "adminId">): Promise<{ adminId: string | null; ownerOnly: boolean }> {
	return p.kind === "ORDER" ? { adminId: p.adminId, ownerOnly: false } : { adminId: null, ownerOnly: true }
}

export interface PaymentProof {
	txid?: string | null
	receiptRef?: string | null
	cardPan?: string | null
	receiptFile?: string | null
}

export async function submitProof(paymentId: string, proof: PaymentProof): Promise<Payment> {
	const p = await prisma.payment.findUnique({ where: { id: paymentId } })
	if (!p) throw new NotFoundError("پرداخت پیدا نشد")
	if (p.status === "CONFIRMED") return p
	if (p.status === "EXPIRED" || (p.status === "PENDING" && p.expiresAt && p.expiresAt.getTime() < Date.now())) throw new AppError("مهلت پرداخت تمام شده است؛ سفارش جدید ثبت کنید", 410)
	const s = await settingsForPayment(p)
	if (p.method === "USDT") {
		const txid = (proof.txid ?? "").trim().replace(/^0x/, "")
		if (!/^[0-9a-fA-F]{64}$/.test(txid)) throw new AppError("TXID نامعتبر است (۶۴ کاراکتر هگز)")
		const dup = await prisma.payment.findUnique({ where: { txid } })
		if (dup && dup.id !== p.id) throw new AppError("این TXID قبلاّ برای پرداخت دیگری ثبت شده است")
		let updated = await prisma.payment.update({ where: { id: p.id }, data: { txid, status: "REVIEW", error: null, meta: { ...((p.meta as object) ?? {}), verify: "pending", tries: 0 } } })
		if (s?.usdtAutoVerify && s.usdtAddress) {
			const r = await verifyTrc20Payment(txid, s.usdtAddress, Number(p.amountUsdt ?? usdtAmountFor(p.amount, s.usdtRate)))
			if (r.ok) return confirmPayment(p.id, { auto: true, note: `USDT ${r.amount} تأیید خودکار` })
			updated = await prisma.payment.update({ where: { id: p.id }, data: { error: r.error ?? null, meta: { ...((updated.meta as object) ?? {}), verify: r.status, tries: 1, amountSeen: r.amount ?? null } } })
		}
		await announceReview(updated)
		return updated
	}
	if (p.method === "CARD") {
		const ref = (proof.receiptRef ?? "").trim()
		if (!ref && !proof.receiptFile) throw new AppError("شماره پیگیری یا تصویر رسید لازم است")
		const updated = await prisma.payment.update({
			where: { id: p.id },
			data: { status: "REVIEW", error: null, receiptRef: ref || p.receiptRef, cardPan: (proof.cardPan ?? "").replace(/[^0-9*]/g, "").slice(-4) || p.cardPan, receiptFile: proof.receiptFile ?? p.receiptFile },
		})
		await announceReview(updated)
		return updated
	}
	throw new AppError("برای این روش پرداخت نیاز به ارسال رسید نیست")
}

async function announceReview(p: Payment): Promise<void> {
	const r = await reviewerId(p)
	const kindFa = p.kind === "ORDER" ? "سفارش" : "شارژ کیف پول"
	const text = `🧾 <b>پرداخت در انتظار بررسی</b> (${kindFa})\nمبلغ: <b>${fmtIrt(p.amount)}</b> تومان — روش: ${p.method}${p.txid ? `\nTXID: <code>${tgEscape(p.txid)}</code>` : ""}${p.receiptRef ? `\nپیگیری: <code>${tgEscape(p.receiptRef)}</code>` : ""}${p.error ? `\n⚠️ ${tgEscape(p.error)}` : ""}\n\nبررسی: ${panelUrl()}/orders?tab=payments`
	await notify("payment.review", text, { dedupeKey: `payrev:${p.id}:${p.updatedAt.getTime()}`, targetId: p.id, recipients: r })
	await emitEvent(p.kind === "ORDER" ? p.adminId : null, "payment.review", { paymentId: p.id, kind: p.kind, method: p.method, amount: p.amount.toString(), txid: p.txid, receiptRef: p.receiptRef })
}

export interface ConfirmOpts {
	by?: Admin | null
	note?: string | null
	auto?: boolean
	refId?: string | null
	cardPan?: string | null
}

export function canReview(actor: Pick<Admin, "id" | "role">, p: Pick<Payment, "kind" | "adminId">): boolean {
	if (actor.role === "OWNER") return true
	return p.kind === "ORDER" && p.adminId === actor.id
}

export async function confirmPayment(paymentId: string, opts: ConfirmOpts = {}): Promise<Payment> {
	const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } })
	if (!p) throw new NotFoundError("پرداخت پیدا نشد")
	if (opts.by && !canReview(opts.by, p)) throw new ForbiddenError()
	if (p.status === "CONFIRMED") return p
	if (p.status === "EXPIRED" && !opts.by) throw new AppError("پرداخت منقضی شده است")
	const updated = await prisma.payment.update({
		where: { id: p.id },
		data: { status: "CONFIRMED", reviewedById: opts.by?.id ?? null, reviewedAt: new Date(), reviewNote: opts.note ?? (opts.auto ? "تأیید خودکار" : null), refId: opts.refId ?? p.refId, cardPan: opts.cardPan ?? p.cardPan, error: null },
	})
	await audit(opts.by?.id ?? null, "payment.confirm", p.id, { kind: p.kind, method: p.method, amount: p.amount.toString(), auto: !!opts.auto })
	if (p.kind === "TOPUP") {
		await chargeWallet({ id: p.adminId, role: "ADMIN" }, p.amount, "TOPUP", { refType: "payment", refId: p.id, byAdminId: opts.by?.id ?? null, note: `شارژ کیف پول (${p.method})` })
		await notify("wallet.topup", `💳 <b>کیف پول شارژ شد</b>\nمبلغ: <b>${fmtIrt(p.amount)}</b> تومان — روش: ${p.method}`, { dedupeKey: `topup:${p.id}`, targetId: p.id, recipients: { adminId: p.adminId } })
		await emitEvent(p.adminId, "wallet.topup", { paymentId: p.id, adminId: p.adminId, amount: p.amount.toString(), method: p.method })
	} else if (p.orderId) {
		await prisma.order.update({ where: { id: p.orderId }, data: { status: "PAID", paidAt: new Date(), error: null } })
		await emitEvent(p.adminId, "order.paid", { orderId: p.orderId, paymentId: p.id, amount: p.amount.toString(), method: p.method })
		await fulfillOrder(p.orderId)
	}
	return updated
}

export async function rejectPayment(actor: Admin, paymentId: string, note?: string | null): Promise<Payment> {
	const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } })
	if (!p) throw new NotFoundError("پرداخت پیدا نشد")
	if (!canReview(actor, p)) throw new ForbiddenError()
	if (p.status === "CONFIRMED") throw new AppError("پرداخت تأییدشده را نمی‌توان رد کرد")
	const updated = await prisma.payment.update({ where: { id: p.id }, data: { status: "REJECTED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: note?.trim() || null } })
	if (p.orderId) await prisma.order.update({ where: { id: p.orderId }, data: { error: `پرداخت رد شد${note ? `: ${note}` : ""}` } })
	await audit(actor.id, "payment.reject", p.id, { kind: p.kind, note: note ?? undefined })
	if (p.order?.customerTelegramId) {
		const tg = await getTelegramSettings()
		if (tg.enabled && tg.botToken) await tgSendMessage(`❌ پرداخت سفارش شما تأیید نشد.${note ? `\nعلت: ${tgEscape(note)}` : ""}\nپیگیری: ${panelUrl()}/shop/o/${p.order.token}`, { chatId: p.order.customerTelegramId })
	}
	await emitEvent(p.kind === "ORDER" ? p.adminId : null, "payment.rejected", { paymentId: p.id, kind: p.kind, note })
	return updated
}

/* ---------- fulfilment ---------- */
export async function fulfillOrder(orderId: string): Promise<Order> {
	const order = await prisma.order.findUnique({ where: { id: orderId }, include: { admin: true } })
	if (!order) throw new NotFoundError("سفارش پیدا نشد")
	if (order.status === "FULFILLED") return order
	if (order.status !== "PAID") throw new AppError("سفارش هنوز پرداخت نشده است")
	const seller = order.admin
	const snap = order.planSnapshot as unknown as PlanSnapshot
	try {
		let clientId: string
		if (order.renewClientId) {
			const existing = await prisma.client.findFirst({ where: { id: order.renewClientId, adminId: seller.id } })
			if (!existing) throw new AppError("کلاینت برای تمدید پیدا نشد")
			await resetClientTraffic(seller, existing.id)
			await updateClient(seller, existing.id, { trafficGB: snap.trafficGB, addDays: snap.days, enabled: true })
			clientId = existing.id
		} else {
			const name = (order.customerName ?? "").trim() || `${snap.name}-${shortId(5)}`
			const { client } = await createClient(seller, {
				name,
				trafficGB: snap.trafficGB,
				days: snap.days,
				ipLimit: snap.ipLimit,
				telegramId: order.customerTelegramId ?? undefined,
				phone: order.customerPhone ?? undefined,
				note: `سفارش فروشگاه #${order.id.slice(-6)}`,
				targets: snap.targets?.length ? snap.targets : order.planId ? planTargets(await prisma.plan.findUniqueOrThrow({ where: { id: order.planId } })) : [],
			})
			clientId = client.id
		}
		const done = await prisma.order.update({ where: { id: order.id }, data: { status: "FULFILLED", clientId, fulfilledAt: new Date(), error: null } })
		if (order.planId) await prisma.plan.update({ where: { id: order.planId }, data: { sold: { increment: 1 } } }).catch(() => undefined)
		await audit(seller.id, "order.fulfill", order.id, { clientId, amount: order.amount.toString() })
		await emitEvent(seller.id, "order.fulfilled", { orderId: order.id, clientId, amount: order.amount.toString(), plan: snap.name })
		await notify("order.fulfilled", `🛒 <b>سفارش جدید تحویل شد</b>\nپلن: ${tgEscape(snap.name)}\nمبلغ: <b>${fmtIrt(order.amount)}</b> تومان\nمشتری: ${tgEscape(order.customerName || order.customerTelegramId || order.customerPhone || "-")}`, { dedupeKey: `order:${order.id}:fulfilled`, targetId: order.id, recipients: { adminId: seller.id } })
		await notifyCustomer(done.id)
		return done
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		const failed = await prisma.order.update({ where: { id: order.id }, data: { error: message.slice(0, 500) } })
		await notify("order.failed", `⚠️ <b>تحویل سفارش ناموفق بود</b>\n${tgEscape(message)}\nسفارش: ${panelUrl()}/orders`, { dedupeKey: `order:${order.id}:failed:${Date.now()}`, targetId: order.id, recipients: { adminId: seller.id } })
		return failed
	}
}

async function notifyCustomer(orderId: string): Promise<void> {
	const order = await prisma.order.findUnique({ where: { id: orderId }, include: { client: true, admin: { include: { brand: true } } } })
	if (!order?.client || !order.customerTelegramId) return
	const tg = await getTelegramSettings()
	if (!tg.enabled || !tg.botToken) return
	const sub = subscriptionUrl(order.client)
	const page = `${panelUrl()}/s/${order.client.subToken}`
	const text = `✅ <b>سفارش شما فعال شد</b> — ${tgEscape(order.admin.brand?.name || brandName())}\n\n🔗 لینک اشتراک:\n<code>${tgEscape(sub)}</code>\n\n📱 صفحه اشتراک و آموزش: ${page}\n📅 انقضا: ${fmtDate(order.client.expiresAt, false) || "نامحدود"}`
	await tgSendMessage(text, { chatId: order.customerTelegramId })
}

export async function retryFulfill(actor: Admin, orderId: string): Promise<Order> {
	const order = await prisma.order.findUnique({ where: { id: orderId } })
	if (!order) throw new NotFoundError("سفارش پیدا نشد")
	if (actor.role !== "OWNER" && order.adminId !== actor.id) throw new ForbiddenError()
	if (order.status === "PENDING") {
		// manual confirm without payment (e.g. paid off-platform)
		await prisma.order.update({ where: { id: order.id }, data: { status: "PAID", paidAt: new Date() } })
		await prisma.payment.updateMany({ where: { orderId: order.id, status: { in: ["PENDING", "REVIEW"] } }, data: { status: "CONFIRMED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: "تأیید دستی" } })
		await audit(actor.id, "order.manual_paid", order.id)
	}
	return fulfillOrder(order.id)
}

export async function cancelOrder(actor: Admin, orderId: string): Promise<Order> {
	const order = await prisma.order.findUnique({ where: { id: orderId } })
	if (!order) throw new NotFoundError("سفارش پیدا نشد")
	if (actor.role !== "OWNER" && order.adminId !== actor.id) throw new ForbiddenError()
	if (order.status === "FULFILLED") throw new AppError("سفارش تحویل‌شده را نمی‌توان لغو کرد")
	await prisma.payment.updateMany({ where: { orderId: order.id, status: { in: ["PENDING", "REVIEW"] } }, data: { status: "REJECTED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: "سفارش لغو شد" } })
	const o = await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELED" } })
	await audit(actor.id, "order.cancel", order.id)
	await emitEvent(order.adminId, "order.canceled", { orderId: order.id })
	return o
}

/* ---------- top-ups (reseller -> owner) ---------- */
export async function createTopup(actor: Admin, input: { amount: number; method: PaymentMethod }): Promise<{ payment: Payment; next: PaymentNext }> {
	if (actor.role === "OWNER") throw new AppError("مالک پنل نیازی به شارژ کیف پول ندارد")
	const amount = Math.round(input.amount)
	if (!Number.isFinite(amount) || amount < 1000) throw new AppError("حداقل مبلغ شارژ ۱۰۰۰ تومان است")
	const owner = await ownerAdmin()
	const s = await storeSettingsByAdminId(owner.id)
	if (!s || !enabledMethods(s).length) throw new AppError("روش پرداختی برای شارژ کیف پول تنظیم نشده است (مالک باید روش‌های پرداخت فروشگاه خود را فعال کند)")
	const r = await beginPayment(s, { kind: "TOPUP", method: input.method, amount: BigInt(amount), adminId: actor.id, description: `شارژ کیف پول ${actor.username} — ${brandName()}` })
	await audit(actor.id, "wallet.topup_request", r.payment.id, { amount, method: input.method })
	return r
}

/** Methods the owner accepts for wallet top-ups */
export async function topupMethods(): Promise<PaymentMethod[]> {
	const owner = await ownerAdmin()
	const s = await storeSettingsByAdminId(owner.id)
	return s ? enabledMethods(s) : []
}

export async function paymentForActor(actor: Admin, id: string): Promise<Payment> {
	const p = await prisma.payment.findUnique({ where: { id } })
	if (!p) throw new NotFoundError("پرداخت پیدا نشد")
	if (actor.role !== "OWNER" && p.adminId !== actor.id) throw new ForbiddenError()
	return p
}

export async function listPayments(actor: Pick<Admin, "id" | "role">, opts: { status?: string; kind?: string; take?: number; skip?: number } = {}) {
	const take = Math.min(200, Math.max(1, opts.take ?? 50))
	const skip = Math.max(0, opts.skip ?? 0)
	const where = {
		...(actor.role === "OWNER" ? {} : { adminId: actor.id }),
		...(opts.status ? { status: opts.status as Payment["status"] } : {}),
		...(opts.kind ? { kind: opts.kind as PaymentKind } : {}),
	}
	const [items, total] = await Promise.all([
		prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, take, skip, include: { admin: { select: { username: true, displayName: true } }, order: { select: { id: true, token: true, status: true, customerName: true, customerTelegramId: true, planSnapshot: true } } } }),
		prisma.payment.count({ where }),
	])
	return { items, total }
}

/* ---------- zarinpal callback ---------- */
export async function handleZarinpalCallback(paymentId: string, authority: string, status: string): Promise<{ ok: boolean; redirect: string; error?: string }> {
	const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } })
	if (!p) return { ok: false, redirect: `${panelUrl()}/`, error: "payment not found" }
	const target = p.order ? `${panelUrl()}/shop/o/${p.order.token}` : `${panelUrl()}/wallet`
	if (p.status === "CONFIRMED") return { ok: true, redirect: `${target}?pay=ok` }
	if (status !== "OK") {
		await prisma.payment.update({ where: { id: p.id }, data: { status: "REJECTED", error: "پرداخت توسط کاربر لغو شد" } })
		return { ok: false, redirect: `${target}?pay=canceled`, error: "canceled" }
	}
	if (p.authority && p.authority !== authority) return { ok: false, redirect: `${target}?pay=failed`, error: "authority mismatch" }
	const s = await settingsForPayment(p)
	const merchant = s ? merchantOf(s) : null
	if (!merchant) return { ok: false, redirect: `${target}?pay=failed`, error: "merchant missing" }
	const r = await zarinpalVerify({ merchantId: merchant, amount: Number(p.amount), authority, sandbox: s!.zarinpalSandbox })
	if (!r.ok) {
		await prisma.payment.update({ where: { id: p.id }, data: { error: r.error, status: "REJECTED" } })
		return { ok: false, redirect: `${target}?pay=failed`, error: r.error }
	}
	await confirmPayment(p.id, { auto: true, refId: r.refId, cardPan: r.cardPan, note: `زرین‌پال — کد رهگیری ${r.refId}` })
	return { ok: true, redirect: `${target}?pay=ok` }
}

/* ---------- worker jobs ---------- */
export async function expirePayments(): Promise<number> {
	const now = new Date()
	const stale = await prisma.payment.findMany({ where: { status: "PENDING", expiresAt: { lt: now } }, select: { id: true, orderId: true } })
	if (!stale.length) return 0
	await prisma.payment.updateMany({ where: { id: { in: stale.map((p) => p.id) } }, data: { status: "EXPIRED" } })
	const orderIds = [...new Set(stale.map((p) => p.orderId).filter((x): x is string => !!x))]
	for (const id of orderIds) {
		const active = await prisma.payment.count({ where: { orderId: id, status: { in: ["PENDING", "REVIEW", "CONFIRMED"] } } })
		if (!active) await prisma.order.updateMany({ where: { id, status: "PENDING" }, data: { status: "EXPIRED" } })
	}
	return stale.length
}

export async function verifyPendingUsdt(): Promise<number> {
	const since = new Date(Date.now() - 3 * 86_400_000)
	const items = await prisma.payment.findMany({ where: { status: "REVIEW", method: "USDT", txid: { not: null }, updatedAt: { gte: since } }, orderBy: { updatedAt: "asc" }, take: 20 })
	let confirmed = 0
	for (const p of items) {
		const meta = (p.meta as { verify?: string; tries?: number } | null) ?? {}
		if (meta.verify === "mismatch" || (meta.tries ?? 0) >= 40) continue
		const s = await settingsForPayment(p)
		if (!s?.usdtAutoVerify || !s.usdtAddress) continue
		const r = await verifyTrc20Payment(p.txid!, s.usdtAddress, Number(p.amountUsdt ?? usdtAmountFor(p.amount, s.usdtRate)))
		if (r.ok) {
			await confirmPayment(p.id, { auto: true, note: `USDT ${r.amount} تأیید خودکار` })
			confirmed++
		} else {
			await prisma.payment.update({ where: { id: p.id }, data: { error: r.error ?? null, meta: { ...meta, verify: r.status, tries: (meta.tries ?? 0) + 1, amountSeen: r.amount ?? null } } })
		}
	}
	return confirmed
}
