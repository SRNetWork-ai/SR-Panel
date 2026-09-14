import { prisma, type Admin, type WalletTxKind } from "@srpanel/db"
import { z } from "zod"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { notify } from "./notifications"
import { getSetting, setSetting } from "./settings"
import { tgEscape } from "./telegram"

/* ---------- pricing (owner) ---------- */
export const pricingSettingsSchema = z.object({
	/** charge resellers from their wallet when provisioning clients */
	billingEnabled: z.boolean().default(false),
	/** IRT per GB */
	pricePerGB: z.number().int().min(0).default(0),
	/** IRT per day */
	pricePerDay: z.number().int().min(0).default(0),
	/** also charge when extending / adding traffic to an existing client */
	chargeOnRenew: z.boolean().default(true),
	/** allowed negative balance (IRT) */
	creditLimit: z.number().int().min(0).default(0),
	/** Telegram warning when a reseller wallet drops under this (IRT, 0 = off) */
	lowBalance: z.number().int().min(0).default(0),
})
export type PricingSettings = z.infer<typeof pricingSettingsSchema>
export const getPricingSettings = () => getSetting("pricing", pricingSettingsSchema)
export const updatePricingSettings = (input: unknown) => setSetting("pricing", pricingSettingsSchema, input)

type PricingActor = Pick<Admin, "id" | "role"> & Partial<Pick<Admin, "pricePerGB" | "pricePerDay">>

export async function unitPricesFor(actor: PricingActor): Promise<{ perGB: bigint; perDay: bigint; enabled: boolean }> {
	const p = await getPricingSettings()
	let perGB = BigInt(p.pricePerGB)
	let perDay = BigInt(p.pricePerDay)
	let own: { pricePerGB: bigint | null; pricePerDay: bigint | null } | null = null
	if (actor.pricePerGB !== undefined && actor.pricePerDay !== undefined) own = { pricePerGB: actor.pricePerGB ?? null, pricePerDay: actor.pricePerDay ?? null }
	else own = await prisma.admin.findUnique({ where: { id: actor.id }, select: { pricePerGB: true, pricePerDay: true } })
	if (own?.pricePerGB != null) perGB = own.pricePerGB
	if (own?.pricePerDay != null) perDay = own.pricePerDay
	return { perGB, perDay, enabled: p.billingEnabled }
}

/** Wholesale cost for a reseller to provision trafficGB/days. Owner or billing disabled => 0 */
export async function quoteClientCost(actor: PricingActor, trafficGB: number, days: number): Promise<bigint> {
	if (actor.role === "OWNER") return 0n
	const u = await unitPricesFor(actor)
	if (!u.enabled) return 0n
	const gb = BigInt(Math.max(0, Math.ceil(trafficGB)))
	const d = BigInt(Math.max(0, Math.ceil(days)))
	return gb * u.perGB + d * u.perDay
}

export async function walletBalance(adminId: string): Promise<bigint> {
	const a = await prisma.admin.findUnique({ where: { id: adminId }, select: { credit: true } })
	return a?.credit ?? 0n
}

const fmt = (n: bigint) => n.toLocaleString("en-US")
const GIB = 1024 ** 3

export async function assertAffordable(actor: Pick<Admin, "id" | "role">, cost: bigint): Promise<void> {
	if (cost <= 0n || actor.role === "OWNER") return
	const p = await getPricingSettings()
	const bal = await walletBalance(actor.id)
	if (bal - cost < -BigInt(p.creditLimit)) {
		throw new AppError(`اعتبار کافی نیست (موجودی: ${fmt(bal)} — هزینه: ${fmt(cost)} تومان)`, 402, "insufficient_credit")
	}
}

/* ---------- quota / limits snapshot (reseller self-service) ---------- */

export interface ResellerLimits {
	/** total bytes the reseller may allocate (null = unlimited) */
	trafficQuota: bigint | null
	/** bytes already allocated to their clients */
	allocated: bigint
	remaining: bigint | null
	clientLimit: number | null
	clients: number
	clientsRemaining: number | null
	expiresAt: Date | null
	expired: boolean
}

/** The limits `assertQuota()` enforces, as data the UI can render. Null for the owner. */
export async function resellerLimits(adminId: string): Promise<ResellerLimits | null> {
	const a = await prisma.admin.findUnique({ where: { id: adminId }, select: { role: true, trafficQuota: true, clientLimit: true, expiresAt: true } })
	if (!a || a.role === "OWNER") return null
	const [agg, clients] = await Promise.all([
		prisma.client.aggregate({ where: { adminId }, _sum: { trafficLimit: true } }),
		prisma.client.count({ where: { adminId } }),
	])
	const allocated = agg._sum.trafficLimit ?? 0n
	return {
		trafficQuota: a.trafficQuota,
		allocated,
		remaining: a.trafficQuota === null ? null : a.trafficQuota - allocated,
		clientLimit: a.clientLimit,
		clients,
		clientsRemaining: a.clientLimit === null ? null : Math.max(0, a.clientLimit - clients),
		expiresAt: a.expiresAt,
		expired: !!a.expiresAt && a.expiresAt.getTime() < Date.now(),
	}
}

export interface QuoteInput {
	/** billable traffic: the whole size when creating, only the *added* GB when renewing */
	trafficGB: number
	/** billable days: the period when creating, only the *added* days when renewing */
	days: number
	/** renewal / upgrade of an existing client (no client-count check) */
	renew?: boolean
	/** GB booked against the traffic quota (defaults to trafficGB) */
	quotaGB?: number
	/** the client would be unlimited — rejected while a traffic quota is set */
	unlimited?: boolean
}

export interface WalletQuote {
	billingEnabled: boolean
	renew: boolean
	chargeOnRenew: boolean
	perGB: bigint
	perDay: bigint
	trafficGB: number
	days: number
	cost: bigint
	balance: bigint
	after: bigint
	creditLimit: bigint
	affordable: boolean
	limits: ResellerLimits | null
	/** Persian reasons the panel would reject this request */
	blockers: string[]
}

/**
 * What provisioning would cost the actor right now, plus every limit that would
 * reject it — so the client form can show a receipt instead of a failed request.
 * Mirrors `quoteClientCost()` + `assertAffordable()` + `assertQuota()`.
 */
export async function quoteForActor(actor: PricingActor, input: QuoteInput): Promise<WalletQuote> {
	const owner = actor.role === "OWNER"
	const [p, unit, balance, limits] = await Promise.all([
		getPricingSettings(),
		unitPricesFor(actor),
		owner ? Promise.resolve(0n) : walletBalance(actor.id),
		owner ? Promise.resolve(null) : resellerLimits(actor.id),
	])
	const gb = Math.max(0, Math.ceil(input.trafficGB || 0))
	const days = Math.max(0, Math.ceil(input.days || 0))
	const cost = owner || !unit.enabled ? 0n : BigInt(gb) * unit.perGB + BigInt(days) * unit.perDay
	const creditLimit = BigInt(p.creditLimit)
	const after = balance - cost
	const affordable = cost <= 0n || after >= -creditLimit
	const blockers: string[] = []
	if (!owner) {
		if (limits?.expired) blockers.push("اعتبار حساب شما به پایان رسیده است")
		if (!affordable) blockers.push(`اعتبار کافی نیست (کمبود ${fmt(-(after + creditLimit))} تومان)`)
		if (!input.renew && limits && limits.clientsRemaining === 0) blockers.push(`سقف تعداد کلاینت (${limits.clientLimit}) پر شده است`)
		if (limits && limits.trafficQuota !== null) {
			if (input.unlimited) blockers.push("با سهمیهٔ محدود نمی‌توانید کلاینت نامحدود بسازید")
			else {
				const need = BigInt(Math.round(Math.max(0, input.quotaGB ?? input.trafficGB) * GIB))
				if (limits.remaining !== null && need > limits.remaining) blockers.push("سهمیهٔ ترافیک شما کافی نیست")
			}
		}
	}
	return {
		billingEnabled: unit.enabled,
		renew: !!input.renew,
		chargeOnRenew: p.chargeOnRenew,
		perGB: unit.perGB,
		perDay: unit.perDay,
		trafficGB: gb,
		days,
		cost,
		balance,
		after,
		creditLimit,
		affordable,
		limits,
		blockers,
	}
}

/** Telegram warning when a reseller wallet crosses under the owner's threshold. */
async function lowBalanceAlert(adminId: string, before: bigint, after: bigint): Promise<void> {
	try {
		const p = await getPricingSettings()
		const limit = BigInt(p.lowBalance)
		if (limit <= 0n || after > limit || before <= limit) return
		const a = await prisma.admin.findUnique({ where: { id: adminId }, select: { role: true, username: true, displayName: true } })
		if (!a || a.role === "OWNER") return
		const text = [
			"💳 <b>اعتبار کیف پول کم است</b>",
			`🧑‍💼 ${tgEscape(a.displayName || a.username)}`,
			`💰 موجودی: ${fmt(after)} تومان`,
			`⚠️ آستانهٔ هشدار: ${fmt(limit)} تومان`,
		].join("\n")
		await notify("wallet.low_balance", text, {
			dedupeKey: `wallet.low:${adminId}:${limit.toString()}:${new Date().toISOString().slice(0, 10)}`,
			targetId: adminId,
			recipients: { adminId },
		})
	} catch {
		/* a notification must never break a purchase */
	}
}

export interface WalletAdjustOpts {
	refType?: string
	refId?: string | null
	note?: string | null
	byAdminId?: string | null
	allowNegative?: boolean
}

/** Atomically move a signed amount on an admin wallet and write a ledger row. Owner purchases are free. */
export async function chargeWallet(target: Pick<Admin, "id" | "role">, amount: bigint, kind: WalletTxKind, opts: WalletAdjustOpts = {}) {
	if (target.role === "OWNER" && kind === "PURCHASE") return null
	if (amount === 0n) return null
	const p = amount < 0n && !opts.allowNegative ? await getPricingSettings() : null
	const row = await prisma.$transaction(async (db) => {
		const a = await db.admin.findUnique({ where: { id: target.id }, select: { credit: true } })
		if (!a) throw new NotFoundError("نماینده یافت نشد")
		const next = a.credit + amount
		if (p && next < -BigInt(p.creditLimit)) throw new AppError("اعتبار کافی نیست", 402, "insufficient_credit")
		await db.admin.update({ where: { id: target.id }, data: { credit: next } })
		return db.walletTx.create({
			data: {
				adminId: target.id,
				kind,
				amount,
				balanceAfter: next,
				refType: opts.refType ?? null,
				refId: opts.refId ?? null,
				note: opts.note ?? null,
				byAdminId: opts.byAdminId ?? null,
			},
		})
	})
	if (amount < 0n) await lowBalanceAlert(target.id, row.balanceAfter - amount, row.balanceAfter)
	return row
}

/** Owner: manual +/- credit for a reseller */
export async function adjustCredit(actor: Admin, adminId: string, amount: bigint, note?: string | null) {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	if (amount === 0n) throw new AppError("مقدار نمی‌تواند صفر باشد")
	const target = await prisma.admin.findUnique({ where: { id: adminId }, select: { id: true, role: true } })
	if (!target) throw new NotFoundError("نماینده یافت نشد")
	const tx = await chargeWallet({ id: target.id, role: "ADMIN" }, amount, "ADJUST", { note: note ?? null, byAdminId: actor.id, allowNegative: true, refType: "manual" })
	await audit(actor.id, "wallet.adjust", adminId, { amount: amount.toString(), note: note ?? undefined })
	return tx
}

export async function listWalletTxs(adminId: string, opts: { take?: number; skip?: number } = {}) {
	const take = Math.min(200, Math.max(1, opts.take ?? 50))
	const skip = Math.max(0, opts.skip ?? 0)
	const [items, total] = await Promise.all([
		prisma.walletTx.findMany({ where: { adminId }, orderBy: { createdAt: "desc" }, take, skip }),
		prisma.walletTx.count({ where: { adminId } }),
	])
	return { items, total }
}

export async function walletOverview(actor: Admin) {
	const since = new Date(Date.now() - 30 * 86_400_000)
	const [balance, unit, txs, pendingTopups, spent, pricing, limits] = await Promise.all([
		walletBalance(actor.id),
		unitPricesFor(actor),
		listWalletTxs(actor.id, { take: 20 }),
		prisma.payment.count({ where: { adminId: actor.id, kind: "TOPUP", status: { in: ["PENDING", "REVIEW"] } } }),
		prisma.walletTx.aggregate({ where: { adminId: actor.id, kind: "PURCHASE", createdAt: { gte: since } }, _sum: { amount: true } }),
		getPricingSettings(),
		actor.role === "OWNER" ? Promise.resolve(null) : resellerLimits(actor.id),
	])
	return {
		balance,
		unit: { perGB: unit.perGB, perDay: unit.perDay, billingEnabled: unit.enabled },
		recent: txs.items,
		pendingTopups,
		spent30d: -(spent._sum.amount ?? 0n),
		creditLimit: BigInt(pricing.creditLimit),
		lowBalance: BigInt(pricing.lowBalance),
		chargeOnRenew: pricing.chargeOnRenew,
		limits,
	}
}

/** Owner: resellers with balances, pricing overrides and 30-day spend (UI DTO) */
export async function resellerBalances() {
	const since = new Date(Date.now() - 30 * 24 * 3600 * 1000)
	const [admins, spent] = await Promise.all([
		prisma.admin.findMany({
			where: { role: "ADMIN" },
			select: { id: true, username: true, displayName: true, credit: true, isActive: true, pricePerGB: true, pricePerDay: true, _count: { select: { clients: true } } },
			orderBy: { username: "asc" },
		}),
		prisma.walletTx.groupBy({ by: ["adminId"], where: { kind: "PURCHASE", createdAt: { gte: since } }, _sum: { amount: true } }),
	])
	const spentBy = new Map(spent.map((r) => [r.adminId, -(r._sum.amount ?? 0n)]))
	return admins.map((a) => ({
		id: a.id,
		username: a.username,
		displayName: a.displayName,
		isActive: a.isActive,
		balance: a.credit,
		pricePerGB: a.pricePerGB,
		pricePerDay: a.pricePerDay,
		clients: a._count.clients,
		spent30d: spentBy.get(a.id) ?? 0n,
	}))
}

export async function setResellerPricing(actor: Admin, adminId: string, input: { pricePerGB?: number | null; pricePerDay?: number | null }) {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const data: { pricePerGB?: bigint | null; pricePerDay?: bigint | null } = {}
	if (input.pricePerGB !== undefined) data.pricePerGB = input.pricePerGB == null ? null : BigInt(Math.max(0, Math.round(input.pricePerGB)))
	if (input.pricePerDay !== undefined) data.pricePerDay = input.pricePerDay == null ? null : BigInt(Math.max(0, Math.round(input.pricePerDay)))
	const a = await prisma.admin.update({ where: { id: adminId }, data, select: { id: true, pricePerGB: true, pricePerDay: true } })
	await audit(actor.id, "wallet.pricing", adminId, { pricePerGB: input.pricePerGB, pricePerDay: input.pricePerDay })
	return a
}
