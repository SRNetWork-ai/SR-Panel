import { prisma, type Admin } from "@srpanel/db"
import { z } from "zod"
import { NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { deleteClient } from "./clients"
import { notify } from "./notifications"
import { clearPendingStart, getPendingStart } from "./pendingStart"
import { getSetting, setSetting } from "./settings"
import { tgEscape } from "./telegram"
import { chargeWallet, unitPricesFor } from "./wallet"

/**
 * Deleting a client gives the unused part of the purchase back to the reseller
 * wallet: leftover GB and leftover days are re-priced with the same unit prices
 * the purchase used, and the result is capped by what was actually charged for
 * that client (ledger rows with refType="client").
 */

const GIB = 1_073_741_824n
const DAY = 86_400_000

export const refundSettingsSchema = z.object({
	/** give unused traffic/days back when a client is deleted */
	refundEnabled: z.boolean().default(true),
	/** share of the unused value that is returned (0-100) */
	refundPercent: z.number().int().min(0).max(100).default(100),
	/** skip refunds below this amount (IRT) */
	refundMin: z.number().int().min(0).default(0),
})
export type RefundSettings = z.infer<typeof refundSettingsSchema>
export const getRefundSettings = () => getSetting("refund", refundSettingsSchema)
export const updateRefundSettings = (input: unknown) => setSetting("refund", refundSettingsSchema, input)

export interface RefundQuote {
	clientId: string
	adminId: string
	/** total charged for this client so far */
	charged: bigint
	/** already given back */
	refunded: bigint
	unusedGB: number
	remainingDays: number
	perGB: bigint
	perDay: bigint
	percent: number
	/** value of the unused part before the percentage and the cap */
	gross: bigint
	/** what would actually be credited right now */
	amount: bigint
	/** Persian explanation when nothing would be refunded */
	reason: string | null
}

const zero = (q: Omit<RefundQuote, "amount" | "reason">, reason: string): RefundQuote => ({ ...q, amount: 0n, reason })

/** What deleting this client would put back into its owner's wallet. */
export async function quoteRefund(clientId: string): Promise<RefundQuote> {
	const client = await prisma.client.findUnique({
		where: { id: clientId },
		select: {
			id: true,
			adminId: true,
			trafficLimit: true,
			usedUp: true,
			usedDown: true,
			expiresAt: true,
			admin: { select: { role: true, pricePerGB: true, pricePerDay: true } },
		},
	})
	if (!client) throw new NotFoundError("کلاینت پیدا نشد")

	const [settings, unit, txs, pending] = await Promise.all([
		getRefundSettings(),
		unitPricesFor({ id: client.adminId, role: client.admin.role, pricePerGB: client.admin.pricePerGB, pricePerDay: client.admin.pricePerDay }),
		prisma.walletTx.findMany({ where: { adminId: client.adminId, refType: "client", refId: clientId, kind: { in: ["PURCHASE", "REFUND"] } }, select: { kind: true, amount: true } }),
		client.expiresAt ? Promise.resolve(null) : getPendingStart(clientId),
	])

	let charged = 0n
	let refunded = 0n
	for (const tx of txs) {
		if (tx.kind === "PURCHASE") charged -= tx.amount
		else refunded += tx.amount
	}

	const used = client.usedUp + client.usedDown
	const unusedBytes = client.trafficLimit > 0n ? (client.trafficLimit > used ? client.trafficLimit - used : 0n) : 0n
	const unusedGB = Number(unusedBytes / GIB)
	const remainingDays = client.expiresAt
		? Math.max(0, Math.ceil((client.expiresAt.getTime() - Date.now()) / DAY))
		: (pending?.days ?? 0)
	const gross = BigInt(unusedGB) * unit.perGB + BigInt(remainingDays) * unit.perDay
	const base = {
		clientId: client.id,
		adminId: client.adminId,
		charged,
		refunded,
		unusedGB,
		remainingDays,
		perGB: unit.perGB,
		perDay: unit.perDay,
		percent: settings.refundPercent,
		gross,
	}

	if (client.admin.role === "OWNER") return zero(base, "کلاینت‌های مالک هزینه‌ای ندارند")
	if (!settings.refundEnabled) return zero(base, "بازگشت وجه توسط مالک غیرفعال شده است")
	if (!unit.enabled) return zero(base, "صورتحساب غیرفعال است")
	const cap = charged - refunded
	if (cap <= 0n) return zero(base, "برای این کلاینت مبلغی کسر نشده است")
	let amount = (gross * BigInt(settings.refundPercent)) / 100n
	if (amount > cap) amount = cap
	if (amount <= 0n) return zero(base, "چیزی برای بازگشت باقی نمانده است")
	if (amount < BigInt(settings.refundMin)) return zero(base, "مبلغ از حداقل بازگشت وجه کمتر است")
	return { ...base, amount, reason: null }
}

export interface DeleteWithRefund {
	errors: string[]
	refund: bigint
	quote: RefundQuote | null
}

/**
 * Wrapper around `deleteClient()` that credits the unused value back. The quote
 * is taken *before* the row disappears; the wallet move happens only after the
 * deletion succeeded, and a failed refund never fails the deletion.
 */
export async function deleteClientWithRefund(actor: Admin, clientId: string): Promise<DeleteWithRefund> {
	let quote: RefundQuote | null = null
	try {
		quote = await quoteRefund(clientId)
	} catch {
		quote = null
	}
	const errors = await deleteClient(actor, clientId)
	await clearPendingStart(clientId).catch(() => undefined)
	if (!quote || quote.amount <= 0n) return { errors, refund: 0n, quote }
	try {
		await chargeWallet({ id: quote.adminId, role: "ADMIN" }, quote.amount, "REFUND", {
			refType: "client",
			refId: clientId,
			byAdminId: actor.id,
			note: `بازگشت ${quote.unusedGB} گیگ و ${quote.remainingDays} روز استفاده‌نشده`,
			allowNegative: true,
		})
		await audit(actor.id, "client.refund", clientId, { amount: quote.amount.toString(), unusedGB: quote.unusedGB, remainingDays: quote.remainingDays })
		await notify(
			"wallet.refund",
			[
				"↩️ <b>بازگشت وجه به کیف پول</b>",
				`💰 مبلغ: ${quote.amount.toLocaleString("en-US")} تومان`,
				`📦 ${quote.unusedGB} گیگ و ${quote.remainingDays} روز استفاده‌نشده`,
				`🗑 ${tgEscape("حذف کلاینت")}`,
			].join("\n"),
			{ dedupeKey: `wallet.refund:${clientId}`, targetId: clientId, recipients: { adminId: quote.adminId } },
		)
	} catch {
		return { errors, refund: 0n, quote }
	}
	return { errors, refund: quote.amount, quote }
}
