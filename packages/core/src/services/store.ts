import { prisma, type Admin, type Brand, type Order, type Payment, type PaymentMethod, type Plan, type StoreSettings } from "@srpanel/db"
import { randomToken } from "../security/token"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { subscriptionUrl } from "./clients"
import { notify } from "./notifications"
import { beginPayment, fulfillOrder, paymentNext, type PaymentNext, type PlanSnapshot } from "./payments"
import { applyDiscount, planTargets } from "./plans"
import { brandName, panelUrl } from "./settings"
import { enabledMethods, storeUrlFor } from "./storeSettings"
import { emitEvent } from "./webhooks"

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
	plans: PublicPlan[]
}

const toPublicPlan = (p: Plan): PublicPlan => ({ id: p.id, name: p.name, description: p.description, badge: p.badge, trafficGB: p.trafficGB, days: p.days, ipLimit: p.ipLimit, price: p.price.toString(), oldPrice: p.oldPrice?.toString() ?? null })

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

export async function publicStorePayload(ctx: StoreContext): Promise<PublicStore> {
	const plans = await prisma.plan.findMany({ where: { adminId: ctx.admin.id, isActive: true }, orderBy: [{ sortOrder: "asc" }, { price: "asc" }] })
	return {
		slug: ctx.settings.slug,
		title: ctx.settings.title || ctx.brand?.name || brandName(),
		description: ctx.settings.description,
		rules: ctx.settings.rules,
		supportUrl: ctx.settings.supportUrl || ctx.brand?.supportUrl || null,
		currency: ctx.settings.currency,
		brand: publicBrand(ctx.brand, ctx.settings.title),
		methods: enabledMethods(ctx.settings),
		requireTelegram: ctx.settings.requireTelegram,
		requirePhone: ctx.settings.requirePhone,
		usdtRate: ctx.settings.usdtRate,
		plans: plans.map(toPublicPlan),
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
	const amount = plan.price - d.discount
	const snapshot: PlanSnapshot = { name: plan.name, trafficGB: plan.trafficGB, days: plan.days, ipLimit: plan.ipLimit, targets: planTargets(plan) }
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

/* ---------- admin side ---------- */
function orderScope(actor: Pick<Admin, "id" | "role">) {
	return actor.role === "OWNER" ? {} : { adminId: actor.id }
}

export async function listOrders(actor: Pick<Admin, "id" | "role">, opts: { status?: string; q?: string; take?: number; skip?: number } = {}) {
	const take = Math.min(200, Math.max(1, opts.take ?? 50))
	const skip = Math.max(0, opts.skip ?? 0)
	const q = opts.q?.trim()
	const where = {
		...orderScope(actor),
		...(opts.status ? { status: opts.status as Order["status"] } : {}),
		...(q
			? { OR: [{ customerName: { contains: q, mode: "insensitive" as const } }, { customerTelegramId: { contains: q } }, { customerPhone: { contains: q } }, { id: { endsWith: q } }, { token: q }] }
			: {}),
	}
	const [items, total] = await Promise.all([
		prisma.order.findMany({
			where,
			orderBy: { createdAt: "desc" },
			take,
			skip,
			include: { plan: { select: { name: true } }, client: { select: { id: true, name: true } }, admin: { select: { username: true } }, payments: { orderBy: { createdAt: "desc" }, take: 1 } },
		}),
		prisma.order.count({ where }),
	])
	return { items, total }
}

export async function orderForActor(actor: Pick<Admin, "id" | "role">, id: string) {
	const o = await prisma.order.findUnique({ where: { id }, include: { plan: true, client: true, payments: { orderBy: { createdAt: "desc" } }, admin: { select: { username: true } } } })
	if (!o) throw new NotFoundError("سفارش پیدا نشد")
	if (actor.role !== "OWNER" && o.adminId !== actor.id) throw new ForbiddenError()
	return o
}

export async function storeOverview(actor: Admin) {
	const since = new Date(Date.now() - 30 * 86_400_000)
	const scope = orderScope(actor)
	const [settings, brand, byStatus, revenue, pendingReview, plans, recent] = await Promise.all([
		prisma.storeSettings.findUnique({ where: { adminId: actor.id } }),
		prisma.brand.findUnique({ where: { adminId: actor.id } }),
		prisma.order.groupBy({ by: ["status"], where: { ...scope, createdAt: { gte: since } }, _count: { _all: true } }),
		prisma.order.aggregate({ where: { ...scope, status: { in: ["PAID", "FULFILLED"] }, createdAt: { gte: since } }, _sum: { amount: true } }),
		prisma.payment.count({ where: { ...(actor.role === "OWNER" ? {} : { adminId: actor.id, kind: "ORDER" }), status: "REVIEW" } }),
		prisma.plan.count({ where: { adminId: actor.id, isActive: true } }),
		prisma.order.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 8, include: { plan: { select: { name: true } } } }),
	])
	const counts: Record<string, number> = {}
	for (const r of byStatus) counts[r.status] = r._count._all
	return {
		enabled: settings?.enabled ?? false,
		slug: settings?.slug ?? null,
		url: settings ? storeUrlFor(settings, brand?.customDomain) : null,
		methods: settings ? enabledMethods(settings) : [],
		counts,
		revenue30d: revenue._sum.amount ?? 0n,
		pendingReview,
		activePlans: plans,
		recent,
	}
}
