import { prisma, type Admin, type Brand, type Order, type Payment, type PaymentMethod, type Plan, type Server, type StoreSettings } from "@srpanel/db"
import { randomToken } from "../security/token"
import { AppError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { cardAutoSettings, rematchDeposits, uniqueCardAmount } from "./cardAuto"
import { subscriptionUrl } from "./clients"
import { effectiveUsdtRate } from "./fx"
import { notify } from "./notifications"
import { beginPayment, fulfillOrder, paymentNext, type PaymentNext, type PlanSnapshot } from "./payments"
import { applyDiscount, planServiceId, planTargets, planTargetsFresh } from "./plans"
import { brandName, panelUrl } from "./settings"
import { cleanStorePage, storePage, type StorePage } from "./storePage"
import { enabledMethods, storeUrlFor } from "./storeSettings"
import { emitEvent } from "./webhooks"

/** Admin-side order lists & dashboard live in ./storeAdmin; re-exported so existing imports keep working. */
export { listOrders, orderForActor, storeOverview } from "./storeAdmin"

export interface StoreContext {
	settings: StoreSettings
	admin: Admin
	brand: Brand | null
}

export interface PublicPlan {
	id: string
	name: string
	description: string | null
	badge: string | null
	trafficGB: number
	days: number
	ipLimit: number
	price: string
	oldPrice: string | null
	/** informational extras for the storefront cards */
	sold: number
	serviceName: string | null
	servers: number
	locations: string[]
	pricePerDay: number | null
	priceUsdt: string | null
}

export interface PublicBrand {
	name: string
	tagline: string | null
	logoUrl: string | null
	primaryColor: string
	accentColor: string
	telegramUrl: string | null
	supportUrl: string | null
}

export interface PublicStore {
	slug: string
	title: string
	description: string | null
	rules: string | null
	supportUrl: string | null
	currency: string
	brand: PublicBrand
	methods: PaymentMethod[]
	requireTelegram: boolean
	requirePhone: boolean
	usdtRate: number
	paymentTtlMin: number
	/** where the quoted USDT rate comes from */
	fx: { auto: boolean; source: string; at: string | null; stale: boolean }
	/** card-to-card orders are confirmed automatically */
	cardAutoVerify: boolean
	page: StorePage
	stats: { plans: number; locations: number; sold: number }
	plans: PublicPlan[]
}

function usdtOf(price: bigint, rate: number): string | null {
	if (rate <= 0) return null
	const v = Number(price) / rate
	if (!Number.isFinite(v) || v <= 0) return null
	return (Math.ceil(v * 100) / 100).toFixed(2)
}

export function publicBrand(brand: Brand | null, fallbackTitle?: string | null): PublicBrand {
	return {
		name: brand?.name || fallbackTitle || brandName(),
		tagline: brand?.tagline ?? null,
		logoUrl: brand?.logoUrl ?? null,
		primaryColor: brand?.primaryColor ?? "#8b5cf6",
		accentColor: brand?.accentColor ?? "#22d3ee",
		telegramUrl: brand?.telegramUrl ?? null,
		supportUrl: brand?.supportUrl ?? null,
	}
}

function ctxOf(s: (StoreSettings & { admin: Admin & { brand: Brand | null } }) | null): StoreContext | null {
	if (!s || !s.enabled || !s.admin.isActive) return null
	return { settings: s, admin: s.admin, brand: s.admin.brand }
}

export async function getStoreBySlug(slug: string): Promise<StoreContext | null> {
	const s = await prisma.storeSettings.findUnique({ where: { slug: slug.toLowerCase() }, include: { admin: { include: { brand: true } } } })
	return ctxOf(s)
}

export async function getStoreByHost(host: string | null | undefined): Promise<StoreContext | null> {
	const h = (host ?? "").toLowerCase().split(":")[0]
	if (!h) return null
	const brand = await prisma.brand.findFirst({ where: { customDomain: h } })
	if (!brand) return null
	const s = await prisma.storeSettings.findUnique({ where: { adminId: brand.adminId }, include: { admin: { include: { brand: true } } } })
	return ctxOf(s)
}

/**
 * Everything the public storefront renders. The USDT rate is resolved through
 * ./fx, so an automatic (multi-source) rate is always fresh here, and the
 * editable page content comes from ./storePage.
 */
export async function publicStorePayload(ctx: StoreContext): Promise<PublicStore> {
	const [plans, page, fx, card] = await Promise.all([
		prisma.plan.findMany({ where: { adminId: ctx.admin.id, isActive: true }, orderBy: [{ sortOrder: "asc" }, { price: "asc" }] }),
		storePage(ctx.admin.id),
		effectiveUsdtRate(ctx.admin.id, ctx.settings.usdtRate),
		cardAutoSettings(ctx.admin.id),
	])
	const serviceIds = [...new Set(plans.map((p) => planServiceId(p)).filter((x): x is string => !!x))]
	const serverIds = [...new Set(plans.flatMap((p) => planTargets(p).map((t) => t.serverId)))]
	const [services, servers] = await Promise.all([
		serviceIds.length ? prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, name: true } }) : Promise.resolve([] as Array<{ id: string; name: string }>),
		serverIds.length ? prisma.server.findMany({ where: { id: { in: serverIds } }, select: { id: true, name: true } }) : Promise.resolve([] as Array<{ id: string; name: string }>),
	])
	const rate = fx.rate
	const publicPlans: PublicPlan[] = plans.map((p) => {
		const targets = planTargets(p)
		const ids = [...new Set(targets.map((t) => t.serverId))]
		const serviceId = planServiceId(p)
		return {
			id: p.id,
			name: p.name,
			description: p.description,
			badge: p.badge,
			trafficGB: p.trafficGB,
			days: p.days,
			ipLimit: p.ipLimit,
			price: p.price.toString(),
			oldPrice: p.oldPrice?.toString() ?? null,
			sold: p.sold,
			serviceName: serviceId ? (services.find((s) => s.id === serviceId)?.name ?? null) : null,
			servers: ids.length,
			locations: ids.map((id) => servers.find((s) => s.id === id)?.name).filter((x): x is string => !!x),
			pricePerDay: p.days > 0 ? Math.round(Number(p.price) / p.days) : null,
			priceUsdt: page.showUsdtPrice ? usdtOf(p.price, rate) : null,
		}
	})
	return {
		slug: ctx.settings.slug,
		title: ctx.settings.title || ctx.brand?.name || brandName(),
		description: ctx.settings.description,
		rules: ctx.settings.rules,
		supportUrl: ctx.settings.supportUrl || ctx.brand?.supportUrl || null,
		currency: ctx.settings.currency,
		brand: publicBrand(ctx.brand, ctx.settings.title),
		// the mirrored rate may lag one request behind, so quote the fresh one
		methods: enabledMethods({ ...ctx.settings, usdtRate: rate }),
		requireTelegram: ctx.settings.requireTelegram,
		requirePhone: ctx.settings.requirePhone,
		usdtRate: rate,
		paymentTtlMin: ctx.settings.paymentTtlMin,
		fx: { auto: fx.auto, source: fx.source, at: fx.at, stale: fx.stale },
		cardAutoVerify: card.mode !== "MANUAL" && card.autoConfirm,
		page: cleanStorePage(page),
		stats: { plans: publicPlans.length, locations: new Set(publicPlans.flatMap((p) => p.locations)).size, sold: plans.reduce((sum, p) => sum + p.sold, 0) },
		plans: publicPlans,
	}
}

export async function previewDiscount(slug: string, planId: string, code: string) {
	const ctx = await getStoreBySlug(slug)
	if (!ctx) throw new NotFoundError("فروشگاه پیدا نشد")
	const plan = await prisma.plan.findFirst({ where: { id: planId, adminId: ctx.admin.id, isActive: true } })
	if (!plan) throw new NotFoundError("پلن پیدا نشد")
	const d = await applyDiscount(ctx.admin.id, code, plan.price)
	return { listPrice: plan.price.toString(), discount: d.discount.toString(), amount: (plan.price - d.discount).toString(), code: d.code, error: d.error ?? null }
}

export interface CreateOrderInput {
	planId: string
	method: PaymentMethod
	customer: { name?: string | null; telegramId?: string | null; phone?: string | null; email?: string | null }
	discountCode?: string | null
	/** subToken of an existing client to renew */
	renewToken?: string | null
	ip?: string | null
}

export interface CreateOrderResult {
	order: Order
	payment: Payment | null
	next: PaymentNext
	token: string
}

export async function createOrder(slug: string, input: CreateOrderInput): Promise<CreateOrderResult> {
	const ctx = await getStoreBySlug(slug)
	if (!ctx) throw new NotFoundError("فروشگاه پیدا نشد یا غیرفعال است")
	const { settings: s, admin: seller } = ctx
	const plan = await prisma.plan.findFirst({ where: { id: input.planId, adminId: seller.id, isActive: true } })
	if (!plan) throw new NotFoundError("پلن پیدا نشد")
	const telegramId = (input.customer.telegramId ?? "").replace(/[^0-9]/g, "").slice(0, 20) || null
	const phone = (input.customer.phone ?? "").replace(/[^0-9+]/g, "").slice(0, 20) || null
	const email = (input.customer.email ?? "").trim().slice(0, 120) || null
	const name = (input.customer.name ?? "").trim().slice(0, 60) || null
	if (s.requireTelegram && !telegramId) throw new AppError("شناسه عددی تلگرام لازم است")
	if (s.requirePhone && !phone) throw new AppError("شماره موبایل لازم است")
	if (input.ip) {
		const recent = await prisma.order.count({ where: { ip: input.ip, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } })
		if (recent >= 10) throw new AppError("تعداد سفارش‌های شما زیاد است؛ کمی بعد تلاش کنید", 429)
	}
	let renewClientId: string | null = null
	if (input.renewToken) {
		const c = await prisma.client.findFirst({ where: { subToken: input.renewToken, adminId: seller.id } })
		if (!c) throw new AppError("اشتراک مورد نظر برای تمدید پیدا نشد")
		renewClientId = c.id
	}
	const d = await applyDiscount(seller.id, input.discountCode, plan.price)
	if (d.error) throw new AppError(d.error)
	let amount = plan.price - d.discount
	// card-to-card auto verification matches deposits by amount, so every open
	// invoice gets its own (slightly different) amount
	if (input.method === "CARD" && amount > 0n) {
		const unique = await uniqueCardAmount(seller.id, Number(amount))
		if (Number.isFinite(unique) && unique > Number(amount)) amount = BigInt(unique)
	}
	// the service behind the plan may have gained/lost inbounds since it was created
	const targets = await planTargetsFresh(plan)
	const snapshot: PlanSnapshot = { name: plan.name, trafficGB: plan.trafficGB, days: plan.days, ipLimit: plan.ipLimit, targets }
	const order = await prisma.order.create({
		data: {
			token: randomToken(16),
			adminId: seller.id,
			planId: plan.id,
			renewClientId,
			listPrice: plan.price,
			discountCode: d.code,
			discountAmount: d.discount,
			amount,
			customerName: name,
			customerTelegramId: telegramId,
			customerPhone: phone,
			customerEmail: email,
			ip: input.ip ?? null,
			planSnapshot: snapshot as unknown as object,
			status: amount <= 0n ? "PAID" : "PENDING",
			paidAt: amount <= 0n ? new Date() : null,
		},
	})
	if (d.id) await prisma.discount.update({ where: { id: d.id }, data: { uses: { increment: 1 } } }).catch(() => undefined)
	await audit(seller.id, "order.create", order.id, { plan: plan.name, amount: amount.toString(), method: input.method, renew: !!renewClientId }, input.ip ?? null)
	await emitEvent(seller.id, "order.created", { orderId: order.id, plan: plan.name, amount: amount.toString(), method: input.method })
	if (amount <= 0n) {
		const done = await fulfillOrder(order.id)
		return { order: done, payment: null, next: { type: "done" }, token: order.token }
	}
	const { payment, next } = await beginPayment(s, { kind: "ORDER", method: input.method, amount, adminId: seller.id, orderId: order.id, description: `${ctx.brand?.name || brandName()} — ${plan.name}`, mobile: phone, email })
	await notify("order.new", `🛍 <b>سفارش جدید</b>\nپلن: ${plan.name}\nمبلغ: <b>${Number(amount).toLocaleString("en-US")}</b> تومان — روش: ${input.method}\nمشتری: ${name || telegramId || phone || "-"}`, { dedupeKey: `order:${order.id}:new`, targetId: order.id, recipients: { adminId: seller.id } })
	// a deposit SMS may already have arrived before the buyer pressed "paid"
	if (input.method === "CARD") await rematchDeposits(seller.id).catch(() => undefined)
	return { order, payment, next, token: order.token }
}

export interface PublicOrder {
	token: string
	status: Order["status"]
	createdAt: string
	expiresAt: string | null
	plan: PlanSnapshot
	amount: string
	listPrice: string
	discountAmount: string
	customer: { name: string | null; telegramId: string | null; phone: string | null }
	payment: { id: string; method: PaymentMethod; status: Payment["status"]; amountUsdt: string | null; txid: string | null; receiptRef: string | null; error: string | null; reviewNote: string | null } | null
	next: PaymentNext
	/** card-to-card deposits of this seller are confirmed automatically */
	autoVerify: boolean
	client: { name: string; subUrl: string; pageUrl: string; expiresAt: string | null; trafficGB: number } | null
	store: { slug: string; title: string; brand: PublicBrand; supportUrl: string | null; url: string }
	error: string | null
}

export async function publicOrder(token: string): Promise<PublicOrder | null> {
	const o = await prisma.order.findUnique({ where: { token }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 }, client: true, admin: { include: { brand: true, store: true } } } })
	if (!o) return null
	const p = o.payments[0] ?? null
	const s = o.admin.store
	const snap = o.planSnapshot as unknown as PlanSnapshot
	const card = p?.method === "CARD" ? await cardAutoSettings(o.adminId) : null
	return {
		token: o.token,
		status: o.status,
		createdAt: o.createdAt.toISOString(),
		expiresAt: p?.expiresAt?.toISOString() ?? null,
		plan: snap,
		amount: o.amount.toString(),
		listPrice: o.listPrice.toString(),
		discountAmount: o.discountAmount.toString(),
		customer: { name: o.customerName, telegramId: o.customerTelegramId, phone: o.customerPhone },
		payment: p ? { id: p.id, method: p.method, status: p.status, amountUsdt: p.amountUsdt, txid: p.txid, receiptRef: p.receiptRef, error: p.error, reviewNote: p.reviewNote } : null,
		next: o.status === "FULFILLED" ? { type: "done" } : p ? paymentNext(p, s) : { type: "none" },
		autoVerify: !!card && card.mode !== "MANUAL" && card.autoConfirm,
		client: o.client ? { name: o.client.name, subUrl: subscriptionUrl(o.client), pageUrl: `${panelUrl()}/s/${o.client.subToken}`, expiresAt: o.client.expiresAt?.toISOString() ?? null, trafficGB: Number(o.client.trafficLimit) / 1024 ** 3 } : null,
		store: { slug: s?.slug ?? "", title: s?.title || o.admin.brand?.name || brandName(), brand: publicBrand(o.admin.brand, s?.title), supportUrl: s?.supportUrl || o.admin.brand?.supportUrl || null, url: s ? storeUrlFor(s, o.admin.brand?.customDomain) : panelUrl() },
		error: o.error,
	}
}

export async function latestPaymentByOrderToken(token: string): Promise<{ order: Order; payment: Payment | null }> {
	const o = await prisma.order.findUnique({ where: { token }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } } })
	if (!o) throw new NotFoundError("سفارش پیدا نشد")
	return { order: o, payment: o.payments[0] ?? null }
}

/** Kept exported for callers that need a plan's server list (storefront cards). */
export function planLocations(plan: Pick<Plan, "targets">, servers: Array<Pick<Server, "id" | "name">>): string[] {
	const ids = [...new Set(planTargets(plan).map((t) => t.serverId))]
	return ids.map((id) => servers.find((s) => s.id === id)?.name).filter((x): x is string => !!x)
}
