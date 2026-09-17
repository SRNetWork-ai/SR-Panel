import { createHmac, randomBytes } from "node:crypto"
import type { Admin } from "@srpanel/db"
import { z } from "zod"
import { AppError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { getSetting, panelUrl, setSetting } from "./settings"

/**
 * Payment plugins - a signed webhook that lets an outside provider or an
 * automation confirm a payment this panel already created.
 *
 * `PaymentMethod` is a database enum and the schema is frozen, so a plugin is
 * deliberately *not* a new method: it rides on an existing one (card, crypto or
 * Zarinpal) and ends in the very same `confirmPayment` the panel uses itself.
 * Definitions live in the `Setting` table, so nothing here needs a migration.
 */

const KEY = "payment_plugins"
const MAX_PER_ADMIN = 10

export const PLUGIN_METHODS = ["CARD", "USDT", "ZARINPAL"] as const
export type PluginMethod = (typeof PLUGIN_METHODS)[number]

const methodSchema = z.enum(["CARD", "USDT", "ZARINPAL"])

const pluginSchema = z.object({
	id: z.string(),
	adminId: z.string(),
	/** created by the owner: may confirm a payment that belongs to any admin */
	master: z.boolean().default(false),
	name: z.string(),
	enabled: z.boolean().default(true),
	secret: z.string(),
	methods: z.array(methodSchema).default(["CARD"]),
	payUrl: z.string().default(""),
	autoConfirm: z.boolean().default(true),
	/** 0 = no ceiling; above it a callback can only send the payment to review */
	maxAmount: z.number().default(0),
	note: z.string().default(""),
	createdAt: z.string(),
	lastCallAt: z.string().nullable().default(null),
	lastStatus: z.string().nullable().default(null),
	lastError: z.string().nullable().default(null),
	calls: z.number().default(0),
	confirmed: z.number().default(0),
})
const bookSchema = z.object({ items: z.record(pluginSchema).default({}) })

export type PaymentPlugin = z.infer<typeof pluginSchema>

export const paymentPluginInput = z.object({
	name: z.string().min(2).max(60),
	enabled: z.boolean().default(true),
	methods: z.array(methodSchema).min(1).default(["CARD"]),
	payUrl: z.string().max(400).default(""),
	autoConfirm: z.boolean().default(true),
	maxAmount: z.number().int().min(0).max(100_000_000_000).default(0),
	note: z.string().max(300).default(""),
})
export const paymentPluginPatch = paymentPluginInput.partial()

export type PaymentPluginInput = z.infer<typeof paymentPluginInput>

export interface PaymentPluginDto {
	id: string
	name: string
	enabled: boolean
	master: boolean
	methods: PluginMethod[]
	payUrl: string
	autoConfirm: boolean
	maxAmount: number
	note: string
	createdAt: string
	lastCallAt: string | null
	lastStatus: string | null
	lastError: string | null
	calls: number
	confirmed: number
	callbackUrl: string
	hasSecret: boolean
}

export interface PluginCallbackResult {
	ok: boolean
	action: "confirmed" | "review" | "rejected" | "ignored"
	paymentId: string | null
	status: string | null
	message: string
}

/** Raw book, secrets included - the webhook handler in `paymentPluginHooks` reads it. */
export const pluginBook = () => getSetting(KEY, bookSchema, 5_000)
export const savePluginBook = (items: Record<string, PaymentPlugin>) => setSetting(KEY, bookSchema, { items })
const bookOf = pluginBook
const saveBook = savePluginBook

/** Where the provider has to POST its callback. */
export function pluginCallbackUrl(id: string): string {
	return panelUrl().replace(/\/+$/, "") + "/api/hooks/pay/" + id
}

/** Public shape: the signing secret never leaves the server after it is created. */
export function paymentPluginDto(p: PaymentPlugin): PaymentPluginDto {
	return {
		id: p.id,
		name: p.name,
		enabled: p.enabled,
		master: p.master,
		methods: p.methods,
		payUrl: p.payUrl,
		autoConfirm: p.autoConfirm,
		maxAmount: p.maxAmount,
		note: p.note,
		createdAt: p.createdAt,
		lastCallAt: p.lastCallAt,
		lastStatus: p.lastStatus,
		lastError: p.lastError,
		calls: p.calls,
		confirmed: p.confirmed,
		callbackUrl: pluginCallbackUrl(p.id),
		hasSecret: !!p.secret,
	}
}

export async function listPaymentPlugins(actor: Pick<Admin, "id">): Promise<PaymentPluginDto[]> {
	const { items } = await bookOf()
	return Object.values(items)
		.filter((p) => p.adminId === actor.id)
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
		.map(paymentPluginDto)
}

async function mine(actor: Pick<Admin, "id">, id: string): Promise<{ items: Record<string, PaymentPlugin>; plugin: PaymentPlugin }> {
	const { items } = await bookOf()
	const plugin = items[id]
	if (!plugin || plugin.adminId !== actor.id) throw new NotFoundError("\u0627\u0641\u0632\u0648\u0646\u0647\u0654 \u067e\u0631\u062f\u0627\u062e\u062a \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f")
	return { items, plugin }
}

export async function createPaymentPlugin(actor: Pick<Admin, "id" | "role">, input: PaymentPluginInput): Promise<{ plugin: PaymentPluginDto; secret: string }> {
	const data = paymentPluginInput.parse(input)
	const { items } = await bookOf()
	if (Object.values(items).filter((p) => p.adminId === actor.id).length >= MAX_PER_ADMIN) throw new AppError("\u0628\u06cc\u0634 \u0627\u0632 \u06f1\u06f0 \u0627\u0641\u0632\u0648\u0646\u0647\u0654 \u067e\u0631\u062f\u0627\u062e\u062a \u0646\u0645\u06cc\u200c\u062a\u0648\u0627\u0646\u06cc\u062f \u0628\u0633\u0627\u0632\u06cc\u062f")
	const id = randomBytes(8).toString("hex")
	const secret = randomBytes(24).toString("hex")
	const plugin: PaymentPlugin = {
		id,
		adminId: actor.id,
		master: String(actor.role) === "OWNER",
		name: data.name.trim(),
		enabled: data.enabled,
		secret,
		methods: data.methods,
		payUrl: data.payUrl.trim(),
		autoConfirm: data.autoConfirm,
		maxAmount: data.maxAmount,
		note: data.note.trim(),
		createdAt: new Date().toISOString(),
		lastCallAt: null,
		lastStatus: null,
		lastError: null,
		calls: 0,
		confirmed: 0,
	}
	await saveBook({ ...items, [id]: plugin })
	await audit(actor.id, "pay.plugin.create", id, { name: plugin.name, methods: plugin.methods })
	return { plugin: paymentPluginDto(plugin), secret }
}

export async function updatePaymentPlugin(actor: Pick<Admin, "id">, id: string, patch: Partial<PaymentPluginInput>): Promise<PaymentPluginDto> {
	const data = paymentPluginPatch.parse(patch)
	const { items, plugin } = await mine(actor, id)
	const next: PaymentPlugin = {
		...plugin,
		name: data.name === undefined ? plugin.name : data.name.trim(),
		enabled: data.enabled ?? plugin.enabled,
		methods: data.methods ?? plugin.methods,
		payUrl: data.payUrl === undefined ? plugin.payUrl : data.payUrl.trim(),
		autoConfirm: data.autoConfirm ?? plugin.autoConfirm,
		maxAmount: data.maxAmount ?? plugin.maxAmount,
		note: data.note === undefined ? plugin.note : data.note.trim(),
	}
	await saveBook({ ...items, [id]: next })
	await audit(actor.id, "pay.plugin.update", id, { name: next.name, enabled: next.enabled })
	return paymentPluginDto(next)
}

/** The old secret stops working immediately; the new one is shown once. */
export async function rotatePaymentPluginSecret(actor: Pick<Admin, "id">, id: string): Promise<{ plugin: PaymentPluginDto; secret: string }> {
	const { items, plugin } = await mine(actor, id)
	const secret = randomBytes(24).toString("hex")
	const next: PaymentPlugin = { ...plugin, secret }
	await saveBook({ ...items, [id]: next })
	await audit(actor.id, "pay.plugin.rotate", id, {})
	return { plugin: paymentPluginDto(next), secret }
}

export async function deletePaymentPlugin(actor: Pick<Admin, "id">, id: string): Promise<{ ok: true }> {
	const { items, plugin } = await mine(actor, id)
	const rest: Record<string, PaymentPlugin> = { ...items }
	delete rest[id]
	await saveBook(rest)
	await audit(actor.id, "pay.plugin.delete", id, { name: plugin.name })
	return { ok: true }
}

/** hex HMAC-SHA256 of the exact bytes the provider sent. */
export function signPluginBody(secret: string, rawBody: string): string {
	return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
}

/** `{amount}` / `{payment}` / `{order}` in the plugin pay link. */
export function pluginPayUrl(payUrl: string, vars: { amount?: number | null; paymentId?: string | null; orderId?: string | null }): string {
	const url = (payUrl ?? "").trim()
	if (!url) return ""
	return url
		.replace(/\{amount\}/gi, vars.amount == null ? "" : String(vars.amount))
		.replace(/\{payment\}/gi, vars.paymentId ?? "")
		.replace(/\{order\}/gi, vars.orderId ?? "")
}
