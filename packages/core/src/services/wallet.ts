import { prisma, type Admin, type WalletTxKind } from "@srpanel/db"
import { z } from "zod"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { getSetting, setSetting } from "./settings"

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

export async function assertAffordable(actor: Pick<Admin, "id" | "role">, cost: bigint): Promise<void> {
	if (cost <= 0n || actor.role === "OWNER") return
	const p = await getPricingSettings()
	const bal = await walletBalance(actor.id)
	if (bal - cost < -BigInt(p.creditLimit)) {
		throw new AppError(`اعتبار کافی نیست (موجودی: ${fmt(bal)} — هزینه: ${fmt(cost)} تومان)`, 402, "insufficient_credit")
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
	return prisma.$transaction(async (tx) => {
		const a = await tx.admin.findUnique({ where: { id: target.id }, select: { credit: true } })
		if (!a) throw new NotFoundError("نماینده یافت نشد")
		const next = a.credit + amount
		if (p && next < -BigInt(p.creditLimit)) throw new AppError("اعتبار کافی نیست", 402, "insufficient_credit")
		await tx.admin.update({ where: { id: target.id }, data: { credit: next } })
		return tx.walletTx.create({
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
	const [balance, unit, txs, pendingTopups, spent] = await Promise.all([
		walletBalance(actor.id),
		unitPricesFor(actor),
		listWalletTxs(actor.id, { take: 20 }),
		prisma.payment.count({ where: { adminId: actor.id, kind: "TOPUP", status: { in: ["PENDING", "REVIEW"] } } }),
		prisma.walletTx.aggregate({ where: { adminId: actor.id, kind: "PURCHASE", createdAt: { gte: since } }, _sum: { amount: true } }),
	])
	return {
		balance,
		unit: { perGB: unit.perGB, perDay: unit.perDay, billingEnabled: unit.enabled },
		recent: txs.items,
		pendingTopups,
		spent30d: -(spent._sum.amount ?? 0n),
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
