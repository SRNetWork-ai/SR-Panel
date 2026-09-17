/**
 * Shared panels \u2014 a storefront plan that hands the buyer their own reseller
 * sub-panel on this install instead of a subscription.
 *
 * A normal `Plan` is only *linked* to a panel package here, so the catalogue,
 * discounts, checkout and payments stay untouched and merely the fulfilment
 * differs (see `panelProvision`). Links and sold accounts live in the `Setting`
 * table, so nothing in this feature needs a migration.
 */
import { prisma, type Admin, type Order } from "@srpanel/db"
import { z } from "zod"
import { ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { getSetting, setSetting } from "./settings"

export const PANEL_PLANS_KEY = "panel_plans"
const GIB = 1_073_741_824

export const panelPlanLinkSchema = z.object({
	planId: z.string().min(1),
	enabled: z.boolean().default(true),
	/** quota of the sub-panel in GB; 0 = take the plan traffic (0 there = unlimited) */
	gb: z.number().int().min(0).max(1_000_000).default(0),
	/** account validity in days; 0 = take the plan days (0 there = never expires) */
	days: z.number().int().min(0).max(3650).default(0),
	/** client slots of the sub-panel; 0 = unlimited */
	clients: z.number().int().min(0).max(100_000).default(0),
	/** username prefix of the account that gets created */
	prefix: z.string().max(12).default("sp"),
	/** copy the plan inbounds into the server access of the new account */
	grantAccess: z.boolean().default(true),
	/** a returning buyer tops the same sub-panel up instead of receiving a second one */
	topUp: z.boolean().default(true),
	note: z.string().max(300).default(""),
})
export type PanelPlanLink = z.infer<typeof panelPlanLinkSchema>

const panelAccountSchema = z.object({
	adminId: z.string().default(""),
	username: z.string().default(""),
	sellerId: z.string().default(""),
	planId: z.string().default(""),
	buyerKey: z.string().default(""),
	/** e-mail / telegram id / phone the buyer used, for the seller's own bookkeeping */
	buyerRef: z.string().default(""),
	orderId: z.string().default(""),
	createdAt: z.string().default(""),
	lastOrderId: z.string().default(""),
	lastAt: z.string().default(""),
	renewals: z.number().default(0),
})
export type PanelAccount = z.infer<typeof panelAccountSchema>

const bookSchema = z.object({
	links: z.record(panelPlanLinkSchema).default({}),
	accounts: z.record(panelAccountSchema).default({}),
})
export type PanelPlanBook = z.infer<typeof bookSchema>

export const panelPlanBook = () => getSetting(PANEL_PLANS_KEY, bookSchema, 5_000)
export const savePanelPlanBook = (v: PanelPlanBook) => setSetting(PANEL_PLANS_KEY, bookSchema, v)

type OrderBuyer = Pick<Order, "id" | "customerId" | "customerEmail" | "customerTelegramId" | "customerPhone">

/** Which buyer an order belongs to \u2014 a returning buyer must find their own sub-panel again. */
export function buyerKeyOf(order: OrderBuyer): string {
	if (order.customerId) return "c:" + order.customerId
	const mail = (order.customerEmail ?? "").trim().toLowerCase()
	if (mail) return "e:" + mail
	const tg = (order.customerTelegramId ?? "").trim()
	if (tg) return "t:" + tg
	const phone = (order.customerPhone ?? "").trim()
	if (phone) return "p:" + phone
	return "o:" + order.id
}

export function buyerRefOf(order: OrderBuyer): string {
	return ((order.customerEmail ?? "").trim() || (order.customerTelegramId ?? "").trim() || (order.customerPhone ?? "").trim()).slice(0, 120)
}

/** The linked package of a plan, or null when the plan sells a normal subscription. */
export async function panelPlanFor(planId: string | null | undefined): Promise<PanelPlanLink | null> {
	if (!planId) return null
	const { links } = await panelPlanBook()
	const link = links[planId]
	return link && link.enabled ? link : null
}

/** Plain object instead of a zod input type, so route bodies stay assignable. */
export type PanelPlanInput = { planId: string } & Partial<Omit<PanelPlanLink, "planId">>

type ActorLike = Pick<Admin, "id" | "role">

const planSelect = { id: true, adminId: true, name: true, price: true, trafficGB: true, days: true, isActive: true } as const
type PlanRow = { id: string; adminId: string; name: string; price: bigint; trafficGB: number; days: number; isActive: boolean }

async function ownPlan(actor: ActorLike, planId: string): Promise<PlanRow> {
	const plan = await prisma.plan.findUnique({ where: { id: planId }, select: planSelect })
	if (!plan) throw new NotFoundError("\u067e\u0644\u0646 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f")
	if (actor.role !== "OWNER" && plan.adminId !== actor.id) throw new ForbiddenError()
	return plan
}

export interface PanelPlanDto extends PanelPlanLink {
	planName: string
	/** IRT as a string: the panel talks to the browser in JSON */
	price: string
	planTrafficGB: number
	planDays: number
	planActive: boolean
	/** sub-panels handed out through this plan */
	sold: number
	/** GB and days a buyer really receives right now */
	effectiveGB: number
	effectiveDays: number
}

function dtoOf(link: PanelPlanLink, plan: PlanRow, sold: number): PanelPlanDto {
	return {
		...link,
		planName: plan.name,
		price: plan.price.toString(),
		planTrafficGB: plan.trafficGB,
		planDays: plan.days,
		planActive: plan.isActive,
		sold,
		effectiveGB: link.gb > 0 ? link.gb : plan.trafficGB,
		effectiveDays: link.days > 0 ? link.days : plan.days,
	}
}

export async function listPanelPlans(actor: ActorLike): Promise<PanelPlanDto[]> {
	const { links, accounts } = await panelPlanBook()
	const ids = Object.keys(links)
	if (!ids.length) return []
	const plans = await prisma.plan.findMany({
		where: { id: { in: ids }, ...(actor.role === "OWNER" ? {} : { adminId: actor.id }) },
		select: planSelect,
	})
	const sold = new Map<string, number>()
	for (const a of Object.values(accounts)) sold.set(a.planId, (sold.get(a.planId) ?? 0) + 1)
	const out: PanelPlanDto[] = []
	for (const plan of plans) {
		const link = links[plan.id]
		if (link) out.push(dtoOf(link, plan, sold.get(plan.id) ?? 0))
	}
	return out.sort((a, b) => a.planName.localeCompare(b.planName))
}

export interface PanelPlanOption {
	id: string
	name: string
	price: string
	trafficGB: number
	days: number
	isActive: boolean
	linked: boolean
}

/** Plans the actor may link \u2014 the picker of the \u00abshared panel\u00bb tab. */
export async function listPanelPlanOptions(actor: ActorLike): Promise<PanelPlanOption[]> {
	const { links } = await panelPlanBook()
	const plans = await prisma.plan.findMany({
		where: actor.role === "OWNER" ? {} : { adminId: actor.id },
		select: planSelect,
		orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
		take: 200,
	})
	return plans.map((p) => ({ id: p.id, name: p.name, price: p.price.toString(), trafficGB: p.trafficGB, days: p.days, isActive: p.isActive, linked: !!links[p.id] }))
}

export async function savePanelPlan(actor: ActorLike, input: PanelPlanInput): Promise<PanelPlanDto> {
	const plan = await ownPlan(actor, input.planId)
	const book = await panelPlanBook()
	const current = book.links[plan.id]
	const link = panelPlanLinkSchema.parse({ ...(current ?? {}), ...input, planId: plan.id })
	await savePanelPlanBook({ ...book, links: { ...book.links, [plan.id]: link } })
	await audit(actor.id, current ? "panelPlan.update" : "panelPlan.link", plan.id, { name: plan.name, gb: link.gb, days: link.days, clients: link.clients, enabled: link.enabled })
	const sold = Object.values(book.accounts).filter((a) => a.planId === plan.id).length
	return dtoOf(link, plan, sold)
}

/** Unlinking only stops future orders; sub-panels already handed out keep working. */
export async function deletePanelPlan(actor: ActorLike, planId: string): Promise<{ ok: true }> {
	const plan = await ownPlan(actor, planId)
	const book = await panelPlanBook()
	if (!book.links[plan.id]) throw new NotFoundError("\u0627\u06cc\u0646 \u067e\u0644\u0646 \u0628\u0647 \u067e\u0646\u0644 \u0627\u0634\u062a\u0631\u0627\u06a9\u06cc \u0648\u0635\u0644 \u0646\u06cc\u0633\u062a")
	const links = { ...book.links }
	delete links[plan.id]
	await savePanelPlanBook({ ...book, links })
	await audit(actor.id, "panelPlan.unlink", plan.id, { name: plan.name })
	return { ok: true }
}

export interface PanelAccountDto {
	adminId: string
	username: string
	planId: string
	planName: string
	buyerRef: string
	orderId: string
	lastOrderId: string
	createdAt: string
	lastAt: string
	renewals: number
	/** false once the account was deleted from the admins page */
	exists: boolean
	isActive: boolean
	expiresAt: string
	quotaGB: number | null
	clientLimit: number | null
	clients: number
	credit: string
}

/** Sub-panels this actor sold, enriched with the live account state. */
export async function listPanelAccounts(actor: ActorLike): Promise<PanelAccountDto[]> {
	const { accounts } = await panelPlanBook()
	const mine = Object.values(accounts).filter((a) => a.adminId && (actor.role === "OWNER" || a.sellerId === actor.id))
	if (!mine.length) return []
	const rows = await prisma.admin.findMany({
		where: { id: { in: mine.map((a) => a.adminId) } },
		select: { id: true, username: true, isActive: true, expiresAt: true, trafficQuota: true, clientLimit: true, credit: true, _count: { select: { clients: true } } },
	})
	const planIds = [...new Set(mine.map((a) => a.planId).filter(Boolean))]
	const plans = planIds.length ? await prisma.plan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true } }) : []
	return mine
		.map((a) => {
			const row = rows.find((r) => r.id === a.adminId)
			return {
				adminId: a.adminId,
				username: row?.username ?? a.username,
				planId: a.planId,
				planName: plans.find((p) => p.id === a.planId)?.name ?? "",
				buyerRef: a.buyerRef,
				orderId: a.orderId,
				lastOrderId: a.lastOrderId,
				createdAt: a.createdAt,
				lastAt: a.lastAt,
				renewals: a.renewals,
				exists: !!row,
				isActive: row?.isActive ?? false,
				expiresAt: row?.expiresAt ? row.expiresAt.toISOString() : "",
				quotaGB: row && row.trafficQuota !== null ? Math.round((Number(row.trafficQuota) / GIB) * 100) / 100 : null,
				clientLimit: row?.clientLimit ?? null,
				clients: row?._count.clients ?? 0,
				credit: row ? row.credit.toString() : "0",
			}
		})
		.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
}
