/**
 * Credentials of a sold sub-panel: delivery to the buyer, the one-time handover
 * for the seller and a password reset.
 *
 * Telegram and e-mail are tried first; only when no channel reaches the buyer are
 * the credentials parked in the `panel_handoff` Setting entry, and the seller
 * reveals them exactly once (revealing deletes the record). Setting-backed, so
 * nothing here needs a schema change.
 */
import { randomInt } from "node:crypto"
import { prisma, type Admin, type Order } from "@srpanel/db"
import { z } from "zod"
import { hashPassword } from "../security/password"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { revokeAllSessions } from "./auth"
import { sendMail } from "./mailer"
import { panelPlanBook } from "./panelPlans"
import { brandName, getSetting, getTelegramSettings, panelUrl, setSetting } from "./settings"
import { tgEscape, tgSendMessage } from "./telegram"

export const PANEL_HANDOFF_KEY = "panel_handoff"
/** newline in one place, so these sources stay free of escape noise */
export const NL = "\n"

const handoffSchema = z.object({
	orderId: z.string().default(""),
	sellerId: z.string().default(""),
	adminId: z.string().default(""),
	username: z.string().default(""),
	/** plaintext, parked only until the seller reveals it once */
	password: z.string().default(""),
	renewal: z.boolean().default(false),
	delivered: z.array(z.string()).default([]),
	createdAt: z.string().default(""),
})
export type PanelHandoff = z.infer<typeof handoffSchema>
const handoffBookSchema = z.object({ items: z.record(handoffSchema).default({}) })

/** never cached: written during fulfilment and read by the seller seconds later */
const handoffBook = () => getSetting(PANEL_HANDOFF_KEY, handoffBookSchema, 0)
const saveHandoffs = (items: Record<string, PanelHandoff>) => setSetting(PANEL_HANDOFF_KEY, handoffBookSchema, { items })

const USER_CHARS = "abcdefghijkmnpqrstuvwxyz23456789"
const PASS_CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function pick(chars: string, len: number): string {
	let out = ""
	for (let i = 0; i < len; i += 1) out += chars[randomInt(0, chars.length)]
	return out
}

export const panelLoginUrl = () => panelUrl().replace(/\/+$/, "") + "/login"
export const newPanelPassword = () => pick(PASS_CHARS, 14)

/** Prefix plus six random characters, checked against the admin table. */
export async function freePanelUsername(prefix: string): Promise<string> {
	const base = prefix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "sp"
	for (let i = 0; i < 12; i += 1) {
		const candidate = base + pick(USER_CHARS, 6)
		const taken = await prisma.admin.findUnique({ where: { username: candidate }, select: { id: true } })
		if (!taken) return candidate
	}
	throw new AppError("\u0633\u0627\u062e\u062a \u0646\u0627\u0645 \u06a9\u0627\u0631\u0628\u0631\u06cc \u06cc\u06a9\u062a\u0627 \u0628\u0631\u0627\u06cc \u0632\u06cc\u0631\u067e\u0646\u0644 \u0645\u0645\u06a9\u0646 \u0646\u0634\u062f")
}

export async function parkPanelHandoff(handoff: PanelHandoff): Promise<void> {
	const { items } = await handoffBook()
	await saveHandoffs({ ...items, [handoff.orderId]: handoff })
}

export type PanelPackage = { gb: number; days: number; clients: number }

const fmtQuota = (gb: number) => (gb > 0 ? gb + " \u06af\u06cc\u06af\u0627\u0628\u0627\u06cc\u062a" : "\u0646\u0627\u0645\u062d\u062f\u0648\u062f")
const fmtDays = (days: number) => (days > 0 ? days + " \u0631\u0648\u0632" : "\u0628\u06cc\u200c\u0627\u0646\u0642\u0636\u0627")
const fmtSlots = (n: number) => (n > 0 ? String(n) : "\u0646\u0627\u0645\u062d\u062f\u0648\u062f")

/** Telegram + e-mail; only the channels that really went out are returned. */
export async function deliverPanelAccount(order: Pick<Order, "customerTelegramId" | "customerEmail">, handoff: PanelHandoff, pkg: PanelPackage): Promise<string[]> {
	const out: string[] = []
	const title = handoff.renewal ? "\u0628\u0633\u062a\u0647\u0654 \u0632\u06cc\u0631\u067e\u0646\u0644 \u0634\u0645\u0627 \u0634\u0627\u0631\u0698 \u0634\u062f" : "\u0632\u06cc\u0631\u067e\u0646\u0644 \u0646\u0645\u0627\u06cc\u0646\u062f\u06af\u06cc \u0634\u0645\u0627 \u0622\u0645\u0627\u062f\u0647 \u0627\u0633\u062a"
	const pass = handoff.password || "\u0647\u0645\u0627\u0646 \u06af\u0630\u0631\u0648\u0627\u0698\u0647\u0654 \u0642\u0628\u0644\u06cc"
	const rows: Array<[string, string]> = [
		["\u0646\u0627\u0645 \u06a9\u0627\u0631\u0628\u0631\u06cc", handoff.username],
		["\u06af\u0630\u0631\u0648\u0627\u0698\u0647", pass],
		["\u0648\u0631\u0648\u062f", panelLoginUrl()],
		["\u062a\u0631\u0627\u0641\u06cc\u06a9", fmtQuota(pkg.gb)],
		["\u0645\u062f\u062a", fmtDays(pkg.days)],
		["\u062a\u0639\u062f\u0627\u062f \u06a9\u0627\u0631\u0628\u0631", fmtSlots(pkg.clients)],
	]
	const text = [brandName() + " \u2014 " + title, "", ...rows.map(([k, v]) => k + ": " + v)].join(NL)
	const tg = await getTelegramSettings()
	if (order.customerTelegramId && tg.enabled && tg.botToken) {
		const html = ["\ud83c\udf9b <b>" + tgEscape(title) + "</b> \u2014 " + tgEscape(brandName()), "", ...rows.map(([k, v]) => tgEscape(k) + ": <code>" + tgEscape(v) + "</code>")].join(NL)
		const res = await tgSendMessage(html, { chatId: order.customerTelegramId })
		if (res.ok) out.push("telegram")
	}
	if (order.customerEmail) {
		const sent = await sendMail({ to: order.customerEmail, subject: brandName() + " \u2014 " + title, text })
			.then(() => true)
			.catch(() => false)
		if (sent) out.push("email")
	}
	return out
}

export interface PanelHandoffDto {
	orderId: string
	adminId: string
	username: string
	renewal: boolean
	delivered: string[]
	createdAt: string
	/** the password is still parked and can be revealed once */
	hasPassword: boolean
	customer: string
	loginUrl: string
}

/** Sub-panels whose credentials nobody received automatically. */
export async function pendingPanelHandoffs(actor: Pick<Admin, "id" | "role">): Promise<PanelHandoffDto[]> {
	const { items } = await handoffBook()
	const mine = Object.values(items).filter((h) => h.adminId && (actor.role === "OWNER" || h.sellerId === actor.id))
	if (!mine.length) return []
	const orders = await prisma.order.findMany({
		where: { id: { in: mine.map((h) => h.orderId) } },
		select: { id: true, customerName: true, customerEmail: true, customerTelegramId: true, customerPhone: true },
	})
	const login = panelLoginUrl()
	return mine
		.map((h) => {
			const o = orders.find((x) => x.id === h.orderId)
			return {
				orderId: h.orderId,
				adminId: h.adminId,
				username: h.username,
				renewal: h.renewal,
				delivered: h.delivered,
				createdAt: h.createdAt,
				hasPassword: !!h.password,
				customer: (o?.customerName || o?.customerEmail || o?.customerTelegramId || o?.customerPhone || "").slice(0, 120),
				loginUrl: login,
			}
		})
		.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export interface PanelCredentials {
	username: string
	password: string
	loginUrl: string
}

/** One shot: the password is returned and the parked record disappears. */
export async function revealPanelHandoff(actor: Pick<Admin, "id" | "role">, orderId: string): Promise<PanelCredentials> {
	const { items } = await handoffBook()
	const handoff = items[orderId]
	if (!handoff || !handoff.adminId) throw new NotFoundError("\u0627\u0637\u0644\u0627\u0639\u0627\u062a \u062a\u062d\u0648\u06cc\u0644 \u0627\u06cc\u0646 \u0633\u0641\u0627\u0631\u0634 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f")
	if (actor.role !== "OWNER" && handoff.sellerId !== actor.id) throw new ForbiddenError()
	if (!handoff.password) throw new AppError("\u06af\u0630\u0631\u0648\u0627\u0698\u0647 \u0630\u062e\u06cc\u0631\u0647 \u0646\u0634\u062f\u0647 \u0627\u0633\u062a\u061b \u0627\u0632 \u00ab\u0628\u0627\u0632\u0646\u0634\u0627\u0646\u06cc \u06af\u0630\u0631\u0648\u0627\u0698\u0647\u00bb \u0627\u0633\u062a\u0641\u0627\u062f\u0647 \u06a9\u0646\u06cc\u062f")
	const rest: Record<string, PanelHandoff> = { ...items }
	delete rest[orderId]
	await saveHandoffs(rest)
	await audit(actor.id, "panel.handoff", handoff.adminId, { orderId, username: handoff.username })
	return { username: handoff.username, password: handoff.password, loginUrl: panelLoginUrl() }
}

/**
 * Seller-side rescue: the buyer lost the password of a sub-panel this actor sold.
 * Sub-admins themselves are owner-only, so without this the seller could not help.
 */
export async function resetPanelAccountPassword(actor: Pick<Admin, "id" | "role">, adminId: string): Promise<PanelCredentials> {
	const { accounts } = await panelPlanBook()
	const account = Object.values(accounts).find((a) => a.adminId === adminId)
	if (!account) throw new NotFoundError("\u0627\u06cc\u0646 \u0632\u06cc\u0631\u067e\u0646\u0644 \u062f\u0631 \u0641\u0647\u0631\u0633\u062a \u0641\u0631\u0648\u0634 \u0634\u0645\u0627 \u0646\u06cc\u0633\u062a")
	if (actor.role !== "OWNER" && account.sellerId !== actor.id) throw new ForbiddenError()
	const target = await prisma.admin.findUnique({ where: { id: adminId } })
	if (!target) throw new NotFoundError("\u062d\u0633\u0627\u0628 \u0627\u06cc\u0646 \u0632\u06cc\u0631\u067e\u0646\u0644 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f")
	if (target.role === "OWNER") throw new ForbiddenError()
	const password = newPanelPassword()
	await prisma.admin.update({ where: { id: adminId }, data: { passwordHash: hashPassword(password) } })
	await revokeAllSessions(adminId)
	await audit(actor.id, "panel.password_reset", adminId, { username: target.username, orderId: account.lastOrderId })
	return { username: target.username, password, loginUrl: panelLoginUrl() }
}
