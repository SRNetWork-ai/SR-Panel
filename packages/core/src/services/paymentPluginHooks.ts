import { timingSafeEqual } from "node:crypto"
import { prisma } from "@srpanel/db"
import { z } from "zod"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { pluginBook, savePluginBook, signPluginBody, type PluginCallbackResult } from "./paymentPlugins"
import { confirmPayment } from "./payments"

/**
 * The public side of a payment plugin: one signed webhook.
 *
 * A provider POSTs raw JSON with an `x-srp-signature` header holding the hex
 * HMAC-SHA256 of exactly those bytes, keyed with the plugin secret. A valid call
 * ends in the same `confirmPayment` every other method uses, so no new payment
 * method - and no schema change - is involved.
 */

const bookOf = pluginBook
const saveBook = savePluginBook

function sameSignature(expected: string, got: string | null | undefined): boolean {
	const clean = (got ?? "").trim().replace(/^sha256=/i, "").toLowerCase()
	if (!clean || clean.length !== expected.length) return false
	try {
		return timingSafeEqual(Buffer.from(clean, "utf8"), Buffer.from(expected, "utf8"))
	} catch {
		return false
	}
}

const callbackSchema = z.object({
	paymentId: z.string().optional(),
	payment: z.string().optional(),
	id: z.string().optional(),
	status: z.string().optional(),
	amount: z.union([z.number(), z.string()]).optional(),
	refId: z.string().optional(),
	ref: z.string().optional(),
	note: z.string().optional(),
})

const OK_WORDS = ["ok", "success", "successful", "paid", "confirmed", "completed", "done", "true", "1"]
const BAD_WORDS = ["fail", "failed", "failure", "cancel", "canceled", "cancelled", "rejected", "declined", "error", "false", "0"]

async function stamp(id: string, status: string, error: string | null, confirmed = false): Promise<void> {
	const { items } = await bookOf()
	const cur = items[id]
	if (!cur) return
	await saveBook({
		...items,
		[id]: { ...cur, calls: cur.calls + 1, confirmed: cur.confirmed + (confirmed ? 1 : 0), lastCallAt: new Date().toISOString(), lastStatus: status, lastError: error },
	})
}

async function finish(id: string, action: PluginCallbackResult["action"], paymentId: string | null, status: string | null, message: string): Promise<PluginCallbackResult> {
	await stamp(id, action.toUpperCase(), action === "confirmed" ? null : message, action === "confirmed")
	return { ok: true, action, paymentId, status, message }
}

/**
 * Verifies the HMAC signature and applies the callback to an existing payment.
 * Throws a 4xx for anything the provider has to fix; a duplicate call is a no-op.
 */
export async function handlePaymentPluginCallback(id: string, rawBody: string, signature: string | null): Promise<PluginCallbackResult> {
	const { items } = await bookOf()
	const plugin = items[id]
	if (!plugin) throw new NotFoundError("\u0627\u0641\u0632\u0648\u0646\u0647\u0654 \u067e\u0631\u062f\u0627\u062e\u062a \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f")
	if (!plugin.enabled) throw new ForbiddenError("\u0627\u06cc\u0646 \u0627\u0641\u0632\u0648\u0646\u0647 \u063a\u06cc\u0631\u0641\u0639\u0627\u0644 \u0627\u0633\u062a")
	if (!plugin.secret) throw new ForbiddenError("\u06a9\u0644\u06cc\u062f \u0627\u0645\u0636\u0627\u06cc \u0627\u06cc\u0646 \u0627\u0641\u0632\u0648\u0646\u0647 \u062a\u0646\u0638\u06cc\u0645 \u0646\u0634\u062f\u0647 \u0627\u0633\u062a")
	if (!sameSignature(signPluginBody(plugin.secret, rawBody), signature)) {
		await stamp(id, "BAD_SIGNATURE", "\u0627\u0645\u0636\u0627\u06cc \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a")
		throw new ForbiddenError("\u0627\u0645\u0636\u0627\u06cc \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a")
	}

	let body: z.infer<typeof callbackSchema>
	try {
		body = callbackSchema.parse(JSON.parse(rawBody || "{}"))
	} catch {
		await stamp(id, "BAD_BODY", "\u0628\u062f\u0646\u0647\u0654 \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0628\u0627\u06cc\u062f JSON \u0645\u0639\u062a\u0628\u0631 \u0628\u0627\u0634\u062f")
		throw new AppError("\u0628\u062f\u0646\u0647\u0654 \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0628\u0627\u06cc\u062f JSON \u0645\u0639\u062a\u0628\u0631 \u0628\u0627\u0634\u062f", 400)
	}

	const paymentId = (body.paymentId ?? body.payment ?? body.id ?? "").trim()
	if (!paymentId) {
		await stamp(id, "NO_PAYMENT_ID", "\u0634\u0646\u0627\u0633\u0647\u0654 \u067e\u0631\u062f\u0627\u062e\u062a \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062f\u0647 \u0627\u0633\u062a")
		throw new AppError("\u0634\u0646\u0627\u0633\u0647\u0654 \u067e\u0631\u062f\u0627\u062e\u062a \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062f\u0647 \u0627\u0633\u062a", 400)
	}
	const p = await prisma.payment.findUnique({ where: { id: paymentId } })
	if (!p) {
		await stamp(id, "NOT_FOUND", "\u067e\u0631\u062f\u0627\u062e\u062a\u06cc \u0628\u0627 \u0627\u06cc\u0646 \u0634\u0646\u0627\u0633\u0647 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f")
		throw new NotFoundError("\u067e\u0631\u062f\u0627\u062e\u062a\u06cc \u0628\u0627 \u0627\u06cc\u0646 \u0634\u0646\u0627\u0633\u0647 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f")
	}
	if (!plugin.master && p.adminId !== plugin.adminId) {
		await stamp(id, "FORBIDDEN", "\u0627\u06cc\u0646 \u067e\u0631\u062f\u0627\u062e\u062a \u0628\u0647 \u0627\u06cc\u0646 \u0627\u0641\u0632\u0648\u0646\u0647 \u0645\u0631\u0628\u0648\u0637 \u0646\u06cc\u0633\u062a")
		throw new ForbiddenError("\u0627\u06cc\u0646 \u067e\u0631\u062f\u0627\u062e\u062a \u0628\u0647 \u0627\u06cc\u0646 \u0627\u0641\u0632\u0648\u0646\u0647 \u0645\u0631\u0628\u0648\u0637 \u0646\u06cc\u0633\u062a")
	}
	if (!(plugin.methods as readonly string[]).includes(String(p.method))) {
		await stamp(id, "METHOD_OFF", "\u0631\u0648\u0634 \u067e\u0631\u062f\u0627\u062e\u062a \u0627\u06cc\u0646 \u062a\u0631\u0627\u06a9\u0646\u0634 \u062f\u0631 \u0627\u0641\u0632\u0648\u0646\u0647 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a")
		throw new ForbiddenError("\u0631\u0648\u0634 \u067e\u0631\u062f\u0627\u062e\u062a \u0627\u06cc\u0646 \u062a\u0631\u0627\u06a9\u0646\u0634 \u062f\u0631 \u0627\u0641\u0632\u0648\u0646\u0647 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a")
	}
	if (p.status === "CONFIRMED") return finish(id, "ignored", p.id, String(p.status), "\u0627\u06cc\u0646 \u067e\u0631\u062f\u0627\u062e\u062a \u0642\u0628\u0644\u0627\u064b \u062a\u0623\u06cc\u06cc\u062f \u0634\u062f\u0647 \u0628\u0648\u062f")
	if (p.status !== "PENDING" && p.status !== "REVIEW") return finish(id, "ignored", p.id, String(p.status), "\u0648\u0636\u0639\u06cc\u062a \u0627\u06cc\u0646 \u067e\u0631\u062f\u0627\u062e\u062a \u0627\u062c\u0627\u0632\u0647\u0654 \u062a\u063a\u06cc\u06cc\u0631 \u0646\u0645\u06cc\u200c\u062f\u0647\u062f")

	const word = String(body.status ?? "ok").trim().toLowerCase()
	const refId = (body.refId ?? body.ref ?? "").trim().slice(0, 120) || null
	const note = (body.note ?? "").trim().slice(0, 300) || null

	if (BAD_WORDS.includes(word)) {
		await prisma.payment.update({ where: { id: p.id }, data: { status: "REJECTED", reviewNote: note ?? "\u0631\u062f \u0634\u062f\u0647 \u0627\u0632 \u0637\u0631\u0641 \u0627\u0641\u0632\u0648\u0646\u0647\u0654 " + plugin.name } })
		await audit(plugin.adminId, "pay.plugin.reject", p.id, { plugin: plugin.id, refId })
		return finish(id, "rejected", p.id, "REJECTED", "\u067e\u0631\u062f\u0627\u062e\u062a \u0631\u062f \u0634\u062f")
	}

	const amount = Number(p.amount)
	const declared = body.amount === undefined ? null : Math.round(Number(String(body.amount).replace(/[^0-9.]/g, "")))
	const short = declared !== null && Number.isFinite(declared) && declared < amount
	const overCap = plugin.maxAmount > 0 && amount > plugin.maxAmount
	const unknown = !OK_WORDS.includes(word)

	if (unknown || short || overCap || !plugin.autoConfirm) {
		const why = short ? "\u0645\u0628\u0644\u063a \u0627\u0639\u0644\u0627\u0645\u200c\u0634\u062f\u0647 \u06a9\u0645\u062a\u0631 \u0627\u0632 \u0645\u0628\u0644\u063a \u067e\u0631\u062f\u0627\u062e\u062a \u0627\u0633\u062a" : overCap ? "\u0645\u0628\u0644\u063a \u0627\u0632 \u0633\u0642\u0641 \u0645\u062c\u0627\u0632 \u0627\u0641\u0632\u0648\u0646\u0647 \u0628\u06cc\u0634\u062a\u0631 \u0627\u0633\u062a" : unknown ? "\u0648\u0636\u0639\u06cc\u062a \u0627\u0631\u0633\u0627\u0644\u06cc \u0646\u0627\u0645\u0634\u062e\u0635 \u0627\u0633\u062a" : "\u062a\u0623\u06cc\u06cc\u062f \u062e\u0648\u062f\u06a9\u0627\u0631 \u0627\u06cc\u0646 \u0627\u0641\u0632\u0648\u0646\u0647 \u062e\u0627\u0645\u0648\u0634 \u0627\u0633\u062a"
		await prisma.payment.update({ where: { id: p.id }, data: { status: "REVIEW", reviewNote: (note ? note + " - " : "") + why + " (" + plugin.name + ")", ...(refId ? { refId } : {}) } })
		await audit(plugin.adminId, "pay.plugin.review", p.id, { plugin: plugin.id, why, declared, amount })
		return finish(id, "review", p.id, "REVIEW", why + "\u061b \u067e\u0631\u062f\u0627\u062e\u062a \u0628\u0631\u0627\u06cc \u0628\u0631\u0631\u0633\u06cc \u062f\u0633\u062a\u06cc \u062b\u0628\u062a \u0634\u062f")
	}

	await confirmPayment(p.id, { auto: true, refId: refId ?? undefined, note: note ?? "\u062a\u0623\u06cc\u06cc\u062f \u062e\u0648\u062f\u06a9\u0627\u0631 \u062a\u0648\u0633\u0637 \u0627\u0641\u0632\u0648\u0646\u0647\u0654 " + plugin.name })
	await audit(plugin.adminId, "pay.plugin.confirm", p.id, { plugin: plugin.id, refId, amount })
	return finish(id, "confirmed", p.id, "CONFIRMED", "\u067e\u0631\u062f\u0627\u062e\u062a \u062a\u0623\u06cc\u06cc\u062f \u0634\u062f")
}
