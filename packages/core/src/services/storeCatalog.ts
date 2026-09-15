import { prisma } from "@srpanel/db"
import { z } from "zod"
import { AppError } from "../util/errors"
import { audit } from "./audit"
import { getSetting, setSetting } from "./settings"

/**
 * Storefront catalogue: plan categories plus the extended per-plan options
 * (ribbon, feature bullets, stock, per-account limit, hidden plans).
 *
 * Everything lives in the generic `Setting` table (`store:catalog:<adminId>`),
 * so the shop gains a real catalogue without a Prisma schema change. Icon names
 * are shared with ./storePage, so the storefront can reuse a single icon map.
 */

const iconEnum = z.enum(["shield", "bolt", "globe", "headset", "infinity", "lock", "device", "star", "clock", "wallet"])
export type StoreCatalogIcon = z.infer<typeof iconEnum>

export const storeCategorySchema = z.object({
	id: z.string().trim().min(1).max(40),
	name: z.string().trim().min(1).max(40),
	description: z.string().trim().max(160).default(""),
	icon: iconEnum.default("star"),
	sortOrder: z.number().int().min(0).max(999).default(0),
	isActive: z.boolean().default(true),
})
export type StoreCategory = z.infer<typeof storeCategorySchema>

export const storePlanOptionsSchema = z.object({
	categoryId: z.string().trim().max(40).default(""),
	/** small coloured label drawn on the storefront card */
	ribbon: z.string().trim().max(24).default(""),
	/** draws the card with an accent ring and sorts it first */
	highlight: z.boolean().default(false),
	/** kept out of the public list; still buyable through `?plan=<id>` */
	hidden: z.boolean().default(false),
	/** short selling points rendered as a checklist */
	features: z.array(z.string().trim().max(80)).max(8).default([]),
	/** extra line shown on the card and at checkout */
	note: z.string().trim().max(200).default(""),
	/** 0 = unlimited, otherwise compared with the plan's `sold` counter */
	stock: z.number().int().min(0).max(1_000_000).default(0),
	/** 0 = unlimited paid orders per storefront account */
	perCustomer: z.number().int().min(0).max(1000).default(0),
})
export type StorePlanOptions = z.infer<typeof storePlanOptionsSchema>

export const storeCatalogSchema = z.object({
	enabled: z.boolean().default(false),
	/** render the plan count next to every category chip */
	showCounts: z.boolean().default(true),
	categories: z.array(storeCategorySchema).max(24).default([]),
	/** planId → options; default rows are never stored */
	items: z.record(storePlanOptionsSchema).default({}),
})
export type StoreCatalog = z.infer<typeof storeCatalogSchema>
/** Raw (pre-default) shape accepted by saveStoreCatalog, e.g. an API body. */
export type StoreCatalogPatch = Partial<z.input<typeof storeCatalogSchema>>

export const DEFAULT_PLAN_OPTIONS: StorePlanOptions = storePlanOptionsSchema.parse({})

const catalogKey = (adminId: string) => `store:catalog:${adminId}`

const isDefaultOptions = (o: StorePlanOptions) =>
	!o.categoryId && !o.ribbon && !o.highlight && !o.hidden && o.features.length === 0 && !o.note && o.stock === 0 && o.perCustomer === 0

export const storeCatalog = (adminId: string) => getSetting(catalogKey(adminId), storeCatalogSchema, 10_000)

/** Options of a single plan, falling back to the neutral defaults. */
export function planOptionsOf(catalog: StoreCatalog, planId: string): StorePlanOptions {
	return catalog.items[planId] ?? DEFAULT_PLAN_OPTIONS
}

/**
 * Merging save: duplicate categories are dropped, categories are kept sorted,
 * options pointing at a removed category lose it, and rows that carry nothing
 * but defaults are discarded so the stored object stays small.
 */
export async function saveStoreCatalog(adminId: string, patch: StoreCatalogPatch): Promise<StoreCatalog> {
	const current = await storeCatalog(adminId)
	const next = storeCatalogSchema.parse({ ...current, ...patch })
	const seen = new Set<string>()
	const categories = next.categories
		.filter((c) => {
			if (seen.has(c.id)) return false
			seen.add(c.id)
			return true
		})
		.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
	const items: Record<string, StorePlanOptions> = {}
	for (const [planId, raw] of Object.entries(next.items)) {
		const o: StorePlanOptions = {
			...raw,
			categoryId: seen.has(raw.categoryId) ? raw.categoryId : "",
			features: raw.features.filter((f) => f.length > 0),
		}
		if (!isDefaultOptions(o)) items[planId] = o
	}
	const saved = await setSetting(catalogKey(adminId), storeCatalogSchema, { ...next, categories, items })
	await audit(adminId, "store.catalog.save", null, { enabled: saved.enabled, categories: categories.length, plans: Object.keys(items).length })
	return saved
}

/* ---------- public storefront payload ---------- */

export interface PublicPlanOptions {
	categoryId: string
	ribbon: string
	highlight: boolean
	features: string[]
	note: string
	/** null = unlimited stock */
	stockLeft: number | null
	soldOut: boolean
	perCustomer: number
}

export interface PublicCategory {
	id: string
	name: string
	description: string
	icon: StoreCatalogIcon
	count: number
}

export interface PublicCatalog {
	enabled: boolean
	showCounts: boolean
	categories: PublicCategory[]
	items: Record<string, PublicPlanOptions>
	/** plans reachable only through a direct link */
	hidden: string[]
}

export const EMPTY_PUBLIC_CATALOG: PublicCatalog = { enabled: false, showCounts: true, categories: [], items: {}, hidden: [] }

/**
 * Catalogue view for `/shop/[slug]`. Plans come from `publicStorePayload()`, so
 * no extra plan query is needed. While the catalogue is off the storefront gets
 * an empty payload and behaves exactly as before.
 */
export async function publicStoreCatalog(adminId: string, plans: Array<{ id: string; sold: number }>): Promise<PublicCatalog> {
	const c = await storeCatalog(adminId)
	if (!c.enabled) return { ...EMPTY_PUBLIC_CATALOG, showCounts: c.showCounts }
	const items: Record<string, PublicPlanOptions> = {}
	const hidden: string[] = []
	const counts = new Map<string, number>()
	for (const p of plans) {
		const o = planOptionsOf(c, p.id)
		const left = o.stock > 0 ? Math.max(0, o.stock - p.sold) : null
		items[p.id] = {
			categoryId: o.categoryId,
			ribbon: o.ribbon,
			highlight: o.highlight,
			features: o.features,
			note: o.note,
			stockLeft: left,
			soldOut: left === 0,
			perCustomer: o.perCustomer,
		}
		if (o.hidden) hidden.push(p.id)
		else if (o.categoryId) counts.set(o.categoryId, (counts.get(o.categoryId) ?? 0) + 1)
	}
	const categories = c.categories
		.filter((x) => x.isActive)
		.map((x) => ({ id: x.id, name: x.name, description: x.description, icon: x.icon, count: counts.get(x.id) ?? 0 }))
		.filter((x) => x.count > 0)
	return { enabled: true, showCounts: c.showCounts, categories, items, hidden }
}

/* ---------- purchase guards ---------- */

/**
 * Enforces the catalogue limits of a plan before an order is created: sold-out
 * stock and the per-account purchase cap. Guest checkout cannot be counted, so
 * a capped plan requires a storefront account.
 */
export async function assertPlanPurchasable(slug: string, planId: string, customerId?: string | null): Promise<void> {
	const store = await prisma.storeSettings.findUnique({ where: { slug: slug.toLowerCase() }, select: { adminId: true } })
	if (!store) return
	const catalog = await storeCatalog(store.adminId)
	if (!catalog.enabled) return
	const o = catalog.items[planId]
	if (!o) return
	if (o.stock > 0) {
		const plan = await prisma.plan.findFirst({ where: { id: planId, adminId: store.adminId }, select: { sold: true } })
		if (plan && plan.sold >= o.stock) throw new AppError("ظرفیت فروش این پلن تکمیل شده است؛ لطفاً پلن دیگری را انتخاب کنید")
	}
	if (o.perCustomer > 0) {
		if (!customerId) throw new AppError("برای خرید این پلن باید وارد حساب کاربری فروشگاه شوید", 401, "login_required")
		const used = await prisma.order.count({ where: { planId, customerId, status: { in: ["PAID", "FULFILLED"] } } })
		if (used >= o.perCustomer) throw new AppError(`سقف خرید این پلن برای هر حساب ${o.perCustomer} عدد است`)
	}
}
