/**
 * Reseller plans — a reseller buys a package for **its own account**: the plan's
 * GB is added to `Admin.trafficQuota`, its days to `Admin.expiresAt` and its
 * extra slots to `Admin.clientLimit`; the price is taken from the reseller
 * wallet.
 *
 * The catalogue lives in the Setting table under the `resellerPlans` key (no
 * schema change) and the owner may restrict a plan to selected resellers.
 */
import { prisma, type Admin } from "@srpanel/db"
import { z } from "zod"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { notify } from "./notifications"
import { getSetting, setSetting } from "./settings"
import { tgEscape } from "./telegram"
import { chargeWallet, getPricingSettings } from "./wallet"

export const RESELLER_PLANS_KEY = "resellerPlans"

const GIB = 1_073_741_824n
const DAY = 86_400_000
const fmt = (n: bigint) => n.toLocaleString("en-US")

export const resellerPlanSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string().default(""),
	/** GB added to the reseller traffic quota (0 = nothing) */
	gb: z.number().int().min(0).default(0),
	/** days added to the reseller account validity (0 = nothing) */
	days: z.number().int().min(0).default(0),
	/** extra client slots (0 = nothing) */
	clients: z.number().int().min(0).default(0),
	/** price in IRT */
	price: z.number().int().min(0).default(0),
	isActive: z.boolean().default(true),
	sortOrder: z.number().int().default(0),
	/** empty = offered to every reseller */
	adminIds: z.array(z.string()).default([]),
})
export type ResellerPlan = z.infer<typeof resellerPlanSchema>

export const resellerPlansSchema = z.object({
	enabled: z.boolean().default(true),
	plans: z.array(resellerPlanSchema).default([]),
})
export type ResellerPlanSettings = z.infer<typeof resellerPlansSchema>

export const getResellerPlanSettings = () => getSetting(RESELLER_PLANS_KEY, resellerPlansSchema)

export interface ResellerPlanInput {
	id?: string | null
	name: string
	description?: string | null
	gb?: number
	days?: number
	clients?: number
	price?: number
	isActive?: boolean
	sortOrder?: number
	adminIds?: string[]
}

const newId = () => `rp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const int = (n: number | undefined): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0)
const sortPlans = (plans: ResellerPlan[]): ResellerPlan[] => [...plans].sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price)

function normalizePlan(input: ResellerPlanInput): ResellerPlan {
	const name = input.name.trim()
	if (!name) throw new AppError("نام بسته لازم است")
	const plan: ResellerPlan = {
		id: input.id?.trim() || newId(),
		name,
		description: input.description?.trim() || "",
		gb: int(input.gb),
		days: int(input.days),
		clients: int(input.clients),
		price: int(input.price),
		isActive: input.isActive ?? true,
		sortOrder: Math.round(input.sortOrder ?? 0),
		adminIds: [...new Set((input.adminIds ?? []).filter((x) => !!x))],
	}
	if (!plan.gb && !plan.days && !plan.clients) throw new AppError(`بستهٔ «${name}» باید حجم، زمان یا ظرفیت کلاینت داشته باشد`)
	return plan
}

/** Owner: saves the catalogue (the editor always sends the whole list). */
export async function saveResellerPlans(patch: { enabled?: boolean; plans?: ResellerPlanInput[] }): Promise<ResellerPlanSettings> {
	const cur = await getResellerPlanSettings()
	const plans = patch.plans ? patch.plans.map(normalizePlan) : cur.plans
	const ids = new Set<string>()
	for (const p of plans) {
		if (ids.has(p.id)) throw new AppError("شناسهٔ بسته تکراری است")
		ids.add(p.id)
	}
	return setSetting(RESELLER_PLANS_KEY, resellerPlansSchema, { enabled: patch.enabled ?? cur.enabled, plans: sortPlans(plans) })
}

type ActorLike = Pick<Admin, "id" | "role">

export const planOfferedTo = (plan: ResellerPlan, actor: ActorLike): boolean => plan.adminIds.length === 0 || plan.adminIds.includes(actor.id)

/** Active plans this reseller may buy — empty while the feature is off. */
export async function listResellerPlansFor(actor: ActorLike): Promise<ResellerPlan[]> {
	const s = await getResellerPlanSettings()
	if (!s.enabled) return []
	return sortPlans(s.plans.filter((p) => p.isActive && planOfferedTo(p, actor)))
}

interface AccountRow {
	id: string
	role: Admin["role"]
	isActive: boolean
	credit: bigint
	trafficQuota: bigint | null
	clientLimit: number | null
	expiresAt: Date | null
}

async function account(id: string): Promise<AccountRow> {
	const me = await prisma.admin.findUnique({
		where: { id },
		select: { id: true, role: true, isActive: true, credit: true, trafficQuota: true, clientLimit: true, expiresAt: true },
	})
	if (!me) throw new NotFoundError("حساب پیدا نشد")
	return me
}

async function planFor(actor: ActorLike, planId: string): Promise<ResellerPlan> {
	const s = await getResellerPlanSettings()
	if (!s.enabled && actor.role !== "OWNER") throw new AppError("فروش بستهٔ نمایندگی فعال نیست")
	const plan = s.plans.find((p) => p.id === planId)
	if (!plan) throw new NotFoundError("بسته پیدا نشد")
	if (actor.role !== "OWNER" && !planOfferedTo(plan, actor)) throw new ForbiddenError("این بسته برای حساب شما ارائه نمی‌شود")
	return plan
}

/** An «unlimited» account gains nothing from a quota / time package. */
function planBlockers(me: AccountRow, plan: ResellerPlan): string[] {
	const out: string[] = []
	if (!plan.isActive) out.push("این بسته غیرفعال است")
	if (!me.isActive) out.push("حساب شما غیرفعال است")
	if (plan.gb > 0 && me.trafficQuota === null) out.push("سهمیهٔ ترافیک حساب شما نامحدود است؛ این بسته چیزی به آن اضافه نمی‌کند")
	if (plan.days > 0 && me.expiresAt === null) out.push("اعتبار زمانی حساب شما نامحدود است؛ این بسته چیزی به آن اضافه نمی‌کند")
	if (plan.clients > 0 && me.clientLimit === null) out.push("تعداد کلاینت حساب شما نامحدود است؛ این بسته چیزی به آن اضافه نمی‌کند")
	return out
}

export interface ResellerPlanQuote {
	plan: ResellerPlan
	price: bigint
	balance: bigint
	after: bigint
	creditLimit: bigint
	affordable: boolean
	/** Persian reasons the purchase would be rejected */
	blockers: string[]
}

/** Read-only receipt for the wallet UI. */
export async function quoteResellerPlan(actor: ActorLike, planId: string): Promise<ResellerPlanQuote> {
	const [plan, me, pricing] = await Promise.all([planFor(actor, planId), account(actor.id), getPricingSettings()])
	const price = BigInt(plan.price)
	const creditLimit = BigInt(pricing.creditLimit)
	const after = me.credit - price
	const affordable = price <= 0n || after >= -creditLimit
	const blockers = me.role === "OWNER" ? ["مالک پنل محدودیت حجم یا زمان ندارد"] : planBlockers(me, plan)
	if (me.role !== "OWNER" && !affordable) blockers.push(`موجودی کیف پول کافی نیست (کمبود ${fmt(-(after + creditLimit))} تومان)`)
	return { plan, price, balance: me.credit, after, creditLimit, affordable, blockers }
}

export interface ResellerPlanPurchase {
	plan: ResellerPlan
	charged: bigint
	balance: bigint
	trafficQuota: bigint | null
	clientLimit: number | null
	expiresAt: Date | null
}

const planParts = (plan: ResellerPlan): string => {
	const out: string[] = []
	if (plan.gb > 0) out.push(`${plan.gb} گیگ`)
	if (plan.days > 0) out.push(`${plan.days} روز`)
	if (plan.clients > 0) out.push(`${plan.clients} کلاینت`)
	return out.join(" + ")
}

/** Charges the wallet, then tops up the reseller's own quota / validity / slots. */
export async function buyResellerPlan(actor: Admin, planId: string): Promise<ResellerPlanPurchase> {
	if (actor.role === "OWNER") throw new ForbiddenError("مالک پنل به بستهٔ نمایندگی نیاز ندارد")
	const plan = await planFor(actor, planId)
	const me = await account(actor.id)
	const blockers = planBlockers(me, plan)
	if (blockers.length) throw new AppError(blockers[0] ?? "خرید این بسته امکان‌پذیر نیست")
	const price = BigInt(plan.price)
	const target = { id: me.id, role: me.role }
	const tx =
		price > 0n
			? await chargeWallet(target, -price, "PURCHASE", { refType: "resellerPlan", refId: plan.id, byAdminId: actor.id, note: `خرید بستهٔ نمایندگی «${plan.name}»` })
			: null
	const data: { trafficQuota?: bigint; clientLimit?: number; expiresAt?: Date } = {}
	if (plan.gb > 0 && me.trafficQuota !== null) data.trafficQuota = me.trafficQuota + BigInt(plan.gb) * GIB
	if (plan.clients > 0 && me.clientLimit !== null) data.clientLimit = me.clientLimit + plan.clients
	if (plan.days > 0 && me.expiresAt !== null) data.expiresAt = new Date(Math.max(Date.now(), me.expiresAt.getTime()) + plan.days * DAY)
	const updated = await prisma.admin
		.update({ where: { id: me.id }, data, select: { credit: true, trafficQuota: true, clientLimit: true, expiresAt: true } })
		.catch(async (err: unknown) => {
			// the wallet was already charged — put the money back before failing
			if (tx) {
				await chargeWallet(target, price, "REFUND", {
					refType: "resellerPlan",
					refId: plan.id,
					byAdminId: actor.id,
					note: `بازگشت وجه بستهٔ ناموفق «${plan.name}»`,
					allowNegative: true,
				}).catch(() => undefined)
			}
			throw err
		})
	await audit(actor.id, "resellerPlan.buy", plan.id, { name: plan.name, gb: plan.gb, days: plan.days, clients: plan.clients, price: plan.price })
	await notify(
		"wallet.reseller_plan",
		[
			"🎁 <b>خرید بستهٔ نمایندگی</b>",
			`📦 ${tgEscape(plan.name)}${planParts(plan) ? ` — ${planParts(plan)}` : ""}`,
			`💰 مبلغ: ${fmt(price)} تومان`,
			`💳 موجودی: ${fmt(updated.credit)} تومان`,
		].join("\n"),
		{ dedupeKey: `resellerPlan.buy:${plan.id}:${me.id}:${Date.now()}`, targetId: plan.id, recipients: { adminId: me.id } },
	)
	return { plan, charged: price, balance: updated.credit, trafficQuota: updated.trafficQuota, clientLimit: updated.clientLimit, expiresAt: updated.expiresAt }
}
