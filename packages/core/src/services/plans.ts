import { prisma, type Admin, type Plan } from "@srpanel/db"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import type { ClientTarget } from "./clients"
import { inboundsOf, listServersFor } from "./servers"
import { quoteClientCost } from "./wallet"

export interface PlanInput {
	name: string
	description?: string | null
	badge?: string | null
	trafficGB: number
	days: number
	ipLimit?: number
	/** IRT */
	price: number
	oldPrice?: number | null
	targets: ClientTarget[]
	isActive?: boolean
	sortOrder?: number
}

export function planTargets(plan: Pick<Plan, "targets">): ClientTarget[] {
	const raw = Array.isArray(plan.targets) ? (plan.targets as unknown[]) : []
	return raw
		.map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : null))
		.filter((t): t is Record<string, unknown> => !!t && typeof t.serverId === "string" && Number.isFinite(Number(t.inboundId)))
		.map((t) => ({ serverId: String(t.serverId), inboundId: Number(t.inboundId) }))
}

async function validateTargets(actor: Pick<Admin, "id" | "role">, targets: ClientTarget[]): Promise<ClientTarget[]> {
	if (!targets.length) throw new AppError("حداقل یک سرور/اینباند برای پلن انتخاب کنید")
	const servers = await listServersFor(actor)
	const out: ClientTarget[] = []
	for (const t of targets) {
		const s = servers.find((x) => x.id === t.serverId)
		if (!s) throw new AppError("یکی از سرورهای پلن در دسترس شما نیست")
		if (!inboundsOf(s).some((i) => i.id === t.inboundId)) throw new AppError(`اینباند ${t.inboundId} روی سرور ${s.name} یافت نشد`)
		if (!out.some((x) => x.serverId === t.serverId && x.inboundId === t.inboundId)) out.push({ serverId: t.serverId, inboundId: t.inboundId })
	}
	return out
}

function planScope(actor: Pick<Admin, "id" | "role">, adminId?: string) {
	if (actor.role === "OWNER") return adminId ? { adminId } : {}
	return { adminId: actor.id }
}

export async function listPlans(actor: Pick<Admin, "id" | "role">, opts: { adminId?: string; activeOnly?: boolean } = {}) {
	const where = { ...planScope(actor, opts.adminId), ...(opts.activeOnly ? { isActive: true } : {}) }
	const items = await prisma.plan.findMany({ where, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { admin: { select: { username: true } } } })
	const withCost = await Promise.all(items.map(async (p) => ({ ...p, cost: await quoteClientCost({ id: p.adminId, role: p.adminId === actor.id ? actor.role : "ADMIN" }, p.trafficGB, p.days) })))
	return withCost
}

export async function getPlanForActor(actor: Pick<Admin, "id" | "role">, id: string): Promise<Plan> {
	const plan = await prisma.plan.findUnique({ where: { id } })
	if (!plan) throw new NotFoundError("پلن پیدا نشد")
	if (actor.role !== "OWNER" && plan.adminId !== actor.id) throw new ForbiddenError()
	return plan
}

function normalize(input: PlanInput) {
	const name = input.name.trim()
	if (!name) throw new AppError("نام پلن لازم است")
	if (!Number.isFinite(input.price) || input.price < 0) throw new AppError("قیمت نامعتبر است")
	return {
		name,
		description: input.description?.trim() || null,
		badge: input.badge?.trim() || null,
		trafficGB: Math.max(0, Math.round(input.trafficGB)),
		days: Math.max(0, Math.round(input.days)),
		ipLimit: Math.max(0, Math.round(input.ipLimit ?? 0)),
		price: BigInt(Math.round(input.price)),
		oldPrice: input.oldPrice == null ? null : BigInt(Math.max(0, Math.round(input.oldPrice))),
		isActive: input.isActive ?? true,
		sortOrder: Math.round(input.sortOrder ?? 0),
	}
}

export async function createPlan(actor: Admin, input: PlanInput): Promise<Plan> {
	const targets = await validateTargets(actor, input.targets)
	const plan = await prisma.plan.create({ data: { adminId: actor.id, ...normalize(input), targets: targets as unknown as object } })
	await audit(actor.id, "plan.create", plan.id, { name: plan.name, price: plan.price.toString() })
	return plan
}

export async function updatePlan(actor: Admin, id: string, input: Partial<PlanInput>): Promise<Plan> {
	const current = await getPlanForActor(actor, id)
	const merged: PlanInput = {
		name: input.name ?? current.name,
		description: input.description === undefined ? current.description : input.description,
		badge: input.badge === undefined ? current.badge : input.badge,
		trafficGB: input.trafficGB ?? current.trafficGB,
		days: input.days ?? current.days,
		ipLimit: input.ipLimit ?? current.ipLimit,
		price: input.price ?? Number(current.price),
		oldPrice: input.oldPrice === undefined ? (current.oldPrice == null ? null : Number(current.oldPrice)) : input.oldPrice,
		targets: input.targets ?? planTargets(current),
		isActive: input.isActive ?? current.isActive,
		sortOrder: input.sortOrder ?? current.sortOrder,
	}
	const targets = input.targets ? await validateTargets({ id: current.adminId, role: actor.role === "OWNER" && current.adminId !== actor.id ? "ADMIN" : actor.role }, merged.targets) : planTargets(current)
	const plan = await prisma.plan.update({ where: { id: current.id }, data: { ...normalize(merged), targets: targets as unknown as object } })
	await audit(actor.id, "plan.update", plan.id, { fields: Object.keys(input) })
	return plan
}

export async function deletePlan(actor: Admin, id: string): Promise<void> {
	const plan = await getPlanForActor(actor, id)
	await prisma.plan.delete({ where: { id: plan.id } })
	await audit(actor.id, "plan.delete", plan.id, { name: plan.name })
}

/* ---------- discounts ---------- */
export interface DiscountInput {
	code: string
	percent?: number
	amount?: number
	maxUses?: number | null
	expiresAt?: string | null
	isActive?: boolean
}

export async function listDiscounts(actor: Pick<Admin, "id" | "role">, adminId?: string) {
	return prisma.discount.findMany({ where: planScope(actor, adminId), orderBy: { createdAt: "desc" } })
}

export async function createDiscount(actor: Admin, input: DiscountInput) {
	const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "")
	if (code.length < 3) throw new AppError("کد تخفیف حداقل ۳ کاراکتر (حروف/عدد) باشد")
	const percent = Math.min(100, Math.max(0, Math.round(input.percent ?? 0)))
	const amount = BigInt(Math.max(0, Math.round(input.amount ?? 0)))
	if (!percent && amount === 0n) throw new AppError("درصد یا مبلغ تخفیف را مشخص کنید")
	const d = await prisma.discount.create({
		data: { adminId: actor.id, code, percent, amount, maxUses: input.maxUses ?? null, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, isActive: input.isActive ?? true },
	})
	await audit(actor.id, "discount.create", d.id, { code })
	return d
}

export async function deleteDiscount(actor: Admin, id: string) {
	const d = await prisma.discount.findUnique({ where: { id } })
	if (!d) throw new NotFoundError()
	if (actor.role !== "OWNER" && d.adminId !== actor.id) throw new ForbiddenError()
	await prisma.discount.delete({ where: { id } })
	await audit(actor.id, "discount.delete", id, { code: d.code })
}

/** Compute discount for a store (seller) & list price. Returns 0n when code invalid. */
export async function applyDiscount(sellerId: string, code: string | null | undefined, price: bigint): Promise<{ discount: bigint; code: string | null; id: string | null; error?: string }> {
	const c = (code ?? "").trim().toUpperCase()
	if (!c) return { discount: 0n, code: null, id: null }
	const d = await prisma.discount.findUnique({ where: { adminId_code: { adminId: sellerId, code: c } } })
	if (!d || !d.isActive) return { discount: 0n, code: null, id: null, error: "کد تخفیف نامعتبر است" }
	if (d.expiresAt && d.expiresAt.getTime() < Date.now()) return { discount: 0n, code: null, id: null, error: "کد تخفیف منقضی شده است" }
	if (d.maxUses != null && d.uses >= d.maxUses) return { discount: 0n, code: null, id: null, error: "سقف استفاده از این کد پر شده است" }
	let discount = (price * BigInt(d.percent)) / 100n + d.amount
	if (discount > price) discount = price
	return { discount, code: d.code, id: d.id }
}
