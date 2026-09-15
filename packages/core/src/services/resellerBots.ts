/**
 * Per-reseller Telegram sales bots.
 *
 * Every reseller may run its own bot that sells from its own storefront. The owner
 * keeps the master switch and the one-time activation price, which is charged from
 * the reseller wallet. Everything lives in the Setting table (key `reseller_bots`),
 * so no schema change is required.
 */
import { prisma, type Admin } from "@srpanel/db"
import { z } from "zod"
import { formatBytes } from "../util/bytes"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { fmtDate } from "./notifications"
import { brandName, getSetting, panelUrl, setSetting } from "./settings"
import { storeUrlFor } from "./storeSettings"
import { tgCall, tgEscape, tgGetMe } from "./telegram"
import { assertAffordable, chargeWallet, walletBalance } from "./wallet"

/* ---------- Persian strings (standalone, so they stay readable) ---------- */
const FA = {
	off: "سرویس ربات فروش برای نمایندگان فعال نیست",
	blocked: "ربات فروش شما توسط مالک پنل قفل شده است",
	badToken: "توکن ربات نامعتبر است",
	taken: "این توکن قبلاً برای ربات دیگری ثبت شده است",
	noBot: "ربات فروشی ثبت نشده است",
	fee: "هزینهٔ فعال‌سازی ربات فروش",
	noStore: "فروشگاه هنوز راه‌اندازی نشده است.",
	buy: "برای خرید یا تمدید اشتراک روی لینک زیر بزنید:",
	myEmpty: "اشتراکی به این حساب تلگرام وصل نیست.",
	myHint: "هنگام خرید شناسه تلگرام خود را وارد کنید تا اشتراک‌ها اینجا نمایش داده شود.",
	yourId: "🆔 شناسه تلگرام شما:",
	sellerOnly: "این دستور فقط برای فروشنده است.",
	orders: "📦 سفارش امروز:",
	revenue: "💰 فروش امروز:",
	review: "🧾 در انتظار بررسی:",
	balance: "💳 موجودی کیف پول:",
	toman: "تومان",
	unlimited: "نامحدود",
	welcome: "👋 خوش آمدید به",
}

const HELP = ["<b>دستورها</b>", "/shop — لینک فروشگاه", "/my — اشتراک‌های من", "/id — شناسه این چت", "/help — همین راهنما"].join("\n")
const SELLER_HELP = "/stats — فروش امروز و موجودی کیف پول (فروشنده)"
const SALES_COMMANDS = [
	{ command: "shop", description: "فروشگاه" },
	{ command: "my", description: "اشتراک‌های من" },
	{ command: "id", description: "شناسه چت" },
	{ command: "help", description: "راهنما" },
]

/* ---------- settings ---------- */

export const resellerBotSchema = z.object({
	token: z.string().trim().default(""),
	username: z.string().trim().default(""),
	enabled: z.boolean().default(true),
	/** owner lock: keeps the row but stops the bot */
	blocked: z.boolean().default(false),
	/** activation fee already paid (IRT) */
	paid: z.number().int().min(0).default(0),
	activatedAt: z.string().default(""),
})
export type ResellerBot = z.infer<typeof resellerBotSchema>

export const resellerBotsSchema = z.object({
	/** owner master switch for the whole feature */
	enabled: z.boolean().default(false),
	/** one-time activation fee charged from the reseller wallet (IRT, 0 = free) */
	setupPrice: z.number().int().min(0).max(1_000_000_000).default(0),
	/** extra line the owner appends to every /start */
	welcome: z.string().max(600).default(""),
	bots: z.record(resellerBotSchema).default({}),
})
export type ResellerBotsSettings = z.infer<typeof resellerBotsSchema>

export const getResellerBots = () => getSetting("reseller_bots", resellerBotsSchema)
const persist = (v: ResellerBotsSettings) => setSetting("reseller_bots", resellerBotsSchema, v)

const TOKEN_RE = /^\d{6,}:[A-Za-z0-9_-]{20,}$/

export interface ResellerBotDto {
	adminId: string
	hasToken: boolean
	tokenMasked: string
	username: string
	enabled: boolean
	blocked: boolean
	paid: number
	activatedAt: string
	link: string
}

export function resellerBotDto(adminId: string, cfg: ResellerBotsSettings): ResellerBotDto {
	const b = cfg.bots[adminId]
	const token = b?.token ?? ""
	return {
		adminId,
		hasToken: !!token,
		tokenMasked: token ? token.slice(0, 6) + "…" + token.slice(-4) : "",
		username: b?.username ?? "",
		enabled: !!b?.enabled,
		blocked: !!b?.blocked,
		paid: b?.paid ?? 0,
		activatedAt: b?.activatedAt ?? "",
		link: b?.username ? "https://t.me/" + b.username : "",
	}
}

/** Owner: master switch, activation price and the shared welcome line. */
export async function saveResellerBotsConfig(actor: Admin, input: { enabled?: boolean; setupPrice?: number; welcome?: string }): Promise<ResellerBotsSettings> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const cfg = await getResellerBots()
	const next = await persist({
		enabled: input.enabled ?? cfg.enabled,
		setupPrice: Math.max(0, Math.round(input.setupPrice ?? cfg.setupPrice)),
		welcome: (input.welcome ?? cfg.welcome).slice(0, 600),
		bots: cfg.bots,
	})
	await audit(actor.id, "resellerBot.config", actor.id, { enabled: next.enabled, setupPrice: next.setupPrice })
	return next
}

/** Reseller (or owner): register / replace the bot token. Charges the activation fee once. */
export async function setResellerBot(actor: Admin, token: string): Promise<ResellerBotDto> {
	const cfg = await getResellerBots()
	const mine = cfg.bots[actor.id]
	if (actor.role !== "OWNER") {
		if (!cfg.enabled) throw new ForbiddenError(FA.off)
		if (mine?.blocked) throw new ForbiddenError(FA.blocked)
	}
	const clean = token.trim()
	if (!TOKEN_RE.test(clean)) throw new AppError(FA.badToken)
	if (Object.entries(cfg.bots).some(([id, b]) => id !== actor.id && b.token === clean)) throw new AppError(FA.taken)
	const me = await tgGetMe(clean)
	if (!me.ok) throw new AppError(FA.badToken + ": " + me.error)
	const fee = actor.role === "OWNER" || mine?.paid ? 0 : Math.max(0, cfg.setupPrice)
	if (fee > 0) {
		await assertAffordable(actor, BigInt(fee))
		await chargeWallet(actor, -BigInt(fee), "PURCHASE", { refType: "reseller_bot", refId: actor.id, note: FA.fee })
	}
	const next = await persist({
		...cfg,
		bots: {
			...cfg.bots,
			[actor.id]: {
				token: clean,
				username: me.result.username ?? "",
				enabled: true,
				blocked: false,
				paid: (mine?.paid ?? 0) + fee,
				activatedAt: mine?.activatedAt || new Date().toISOString(),
			},
		},
	})
	await audit(actor.id, "resellerBot.set", actor.id, { username: me.result.username, fee })
	return resellerBotDto(actor.id, next)
}

/** Reseller: pause / resume its own bot without losing the token. */
export async function setResellerBotEnabled(actor: Admin, enabled: boolean): Promise<ResellerBotDto> {
	const cfg = await getResellerBots()
	const b = cfg.bots[actor.id]
	if (!b?.token) throw new NotFoundError(FA.noBot)
	if (enabled && actor.role !== "OWNER") {
		if (!cfg.enabled) throw new ForbiddenError(FA.off)
		if (b.blocked) throw new ForbiddenError(FA.blocked)
	}
	const next = await persist({ ...cfg, bots: { ...cfg.bots, [actor.id]: { ...b, enabled } } })
	return resellerBotDto(actor.id, next)
}

/** Remove a bot: the reseller its own, the owner any. */
export async function deleteResellerBot(actor: Admin, adminId?: string): Promise<{ ok: true }> {
	const target = adminId && adminId !== actor.id ? adminId : actor.id
	if (target !== actor.id && actor.role !== "OWNER") throw new ForbiddenError()
	const cfg = await getResellerBots()
	const bots = { ...cfg.bots }
	delete bots[target]
	await persist({ ...cfg, bots })
	await audit(actor.id, "resellerBot.delete", target, {})
	return { ok: true }
}

/** Owner: lock a single reseller bot (kept, but stopped and un-resumable). */
export async function setResellerBotBlocked(actor: Admin, adminId: string, blocked: boolean): Promise<ResellerBotDto> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const cfg = await getResellerBots()
	const b = cfg.bots[adminId]
	if (!b?.token) throw new NotFoundError(FA.noBot)
	const next = await persist({ ...cfg, bots: { ...cfg.bots, [adminId]: { ...b, blocked, enabled: blocked ? false : b.enabled } } })
	await audit(actor.id, "resellerBot.block", adminId, { blocked })
	return resellerBotDto(adminId, next)
}

export interface ResellerBotRow extends ResellerBotDto {
	adminName: string
	adminActive: boolean
}

/** Owner: every registered bot with its reseller. */
export async function listResellerBots(): Promise<ResellerBotRow[]> {
	const cfg = await getResellerBots()
	const ids = Object.keys(cfg.bots)
	if (!ids.length) return []
	const admins = await prisma.admin.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, displayName: true, isActive: true } })
	const by = new Map(admins.map((a) => [a.id, a]))
	return ids.map((id) => {
		const a = by.get(id)
		return { ...resellerBotDto(id, cfg), adminName: a?.displayName || a?.username || id, adminActive: !!a?.isActive }
	})
}

/* ---------- bot runtime (worker) ---------- */

type TgUpdate = { update_id: number; message?: { message_id: number; text?: string; chat: { id: number } } }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function clientLine(c: { name: string; status: string; usedUp: bigint; usedDown: bigint; trafficLimit: bigint; expiresAt: Date | null; subToken: string }): string {
	const used = Number(c.usedUp + c.usedDown)
	const lim = Number(c.trafficLimit)
	const icon = c.status === "ACTIVE" ? "🟢" : c.status === "EXPIRED" ? "⛔️" : c.status === "LIMITED" ? "📛" : "⚪️"
	return [
		icon + " <b>" + tgEscape(c.name) + "</b> — " + c.status,
		"📦 " + formatBytes(used) + " / " + (lim > 0 ? formatBytes(lim) : FA.unlimited),
		"📅 " + fmtDate(c.expiresAt, false),
		"🔗 " + panelUrl() + "/s/" + c.subToken,
	].join("\n")
}

/** Customer-facing commands of one reseller bot. */
async function handleSalesCommand(adminId: string, chatId: string, text: string, welcome: string): Promise<string> {
	const [rawCmd = ""] = text.trim().split(/\s+/)
	const cmd = rawCmd.toLowerCase().replace(/@.*$/, "")
	if (cmd === "/id") return FA.yourId + " <code>" + chatId + "</code>"

	const [st, admin] = await Promise.all([
		prisma.storeSettings.findUnique({ where: { adminId }, include: { admin: { include: { brand: true } } } }),
		prisma.admin.findUnique({ where: { id: adminId }, select: { id: true, role: true, telegramId: true } }),
	])
	const isSeller = !!admin?.telegramId && admin.telegramId === chatId
	const title = st?.title || st?.admin.brand?.name || brandName()
	const shop = st && st.enabled ? storeUrlFor(st, st.admin.brand?.customDomain) : ""
	const help = HELP + (isSeller ? "\n" + SELLER_HELP : "")

	if (cmd === "/stats") {
		if (!isSeller) return "⛔️ " + FA.sellerOnly
		const since = new Date()
		since.setHours(0, 0, 0, 0)
		const [today, review, revenue, bal] = await Promise.all([
			prisma.order.count({ where: { adminId, createdAt: { gte: since } } }),
			prisma.payment.count({ where: { adminId, kind: "ORDER", status: "REVIEW" } }),
			prisma.order.aggregate({ where: { adminId, status: { in: ["PAID", "FULFILLED"] }, createdAt: { gte: since } }, _sum: { amount: true } }),
			admin?.role === "OWNER" ? Promise.resolve(0n) : walletBalance(adminId),
		])
		return [
			"📊 <b>" + tgEscape(title) + "</b>",
			FA.orders + " <b>" + today + "</b>",
			FA.revenue + " <b>" + Number(revenue._sum.amount ?? 0n).toLocaleString("en-US") + "</b> " + FA.toman,
			FA.review + " <b>" + review + "</b>",
			FA.balance + " <b>" + Number(bal).toLocaleString("en-US") + "</b> " + FA.toman,
			"🔗 " + panelUrl() + "/orders",
		].join("\n")
	}

	if (cmd === "/my" || cmd === "/sub") {
		const items = await prisma.client.findMany({ where: { adminId, telegramId: chatId }, take: 10, orderBy: { createdAt: "desc" } })
		if (!items.length) return ["ℹ️ " + FA.myEmpty, FA.myHint, FA.yourId + " <code>" + chatId + "</code>"].join("\n")
		return items.map((c) => clientLine(c)).join("\n\n")
	}

	if (cmd === "/help") return help
	if (!shop) return "⚠️ " + FA.noStore

	const lines = [FA.welcome + " <b>" + tgEscape(title) + "</b>"]
	if (welcome) lines.push(tgEscape(welcome))
	lines.push("", "🛒 " + FA.buy, shop + "?tg=" + chatId, "", FA.yourId + " <code>" + chatId + "</code>", "", help)
	return lines.join("\n")
}

/**
 * Short-polls every active reseller bot in one loop (one pass per ~3s), so a
 * hundred bots still cost a single worker task. Resolves when `signal` aborts.
 */
export async function pollResellerBots(signal: AbortSignal, log: (msg: string) => void = () => undefined): Promise<void> {
	const offsets = new Map<string, number>()
	const ready = new Map<string, string>()
	const bad = new Set<string>()
	while (!signal.aborted) {
		let cfg: ResellerBotsSettings
		try {
			cfg = await getResellerBots()
		} catch (err) {
			log("reseller bots: settings unreadable: " + (err instanceof Error ? err.message : String(err)))
			await sleep(20_000)
			continue
		}
		const active = Object.entries(cfg.bots).filter(([, b]) => !!b.token && b.enabled && !b.blocked && !bad.has(b.token))
		if (!cfg.enabled || !active.length) {
			await sleep(20_000)
			continue
		}
		for (const [adminId, bot] of active) {
			if (signal.aborted) break
			try {
				if (ready.get(adminId) !== bot.token) {
					const me = await tgGetMe(bot.token)
					if (!me.ok) {
						bad.add(bot.token)
						log("reseller bot " + adminId + ": invalid token (" + me.error + ")")
						continue
					}
					await tgCall(bot.token, "deleteWebhook", { drop_pending_updates: false })
					await tgCall(bot.token, "setMyCommands", { commands: SALES_COMMANDS })
					ready.set(adminId, bot.token)
					offsets.set(adminId, 0)
					log("reseller bot online: @" + me.result.username)
				}
				const r = await tgCall<TgUpdate[]>(bot.token, "getUpdates", { offset: offsets.get(adminId) ?? 0, timeout: 0, limit: 20, allowed_updates: ["message"] })
				if (!r.ok) {
					log("reseller bot " + adminId + ": " + r.error)
					continue
				}
				for (const u of r.result) {
					offsets.set(adminId, Math.max(offsets.get(adminId) ?? 0, u.update_id + 1))
					const msg = u.message
					if (!msg?.text || !msg.text.startsWith("/")) continue
					const chatId = String(msg.chat.id)
					const out = await handleSalesCommand(adminId, chatId, msg.text, cfg.welcome)
					await tgCall(bot.token, "sendMessage", {
						chat_id: chatId,
						text: out.slice(0, 4000),
						parse_mode: "HTML",
						disable_web_page_preview: true,
						reply_to_message_id: msg.message_id,
					})
				}
			} catch (err) {
				log("reseller bot " + adminId + " failed: " + (err instanceof Error ? err.message : String(err)))
			}
		}
		await sleep(3_000)
	}
}
