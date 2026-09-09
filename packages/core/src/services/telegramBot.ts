/**
 * Admin Telegram bot (long polling, runs inside the worker).
 * Auth: the settings chatId is the owner; other chats must match an active Admin.telegramId.
 */
import { prisma, type Admin } from "@srpanel/db"
import { formatBytes } from "../util/bytes"
import { runBackup } from "./backup"
import { INCIDENT_LABEL } from "./monitoring"
import { fmtDate } from "./notifications"
import { brandName, getTelegramSettings, panelUrl } from "./settings"
import { tgCall, tgEscape } from "./telegram"
import { walletBalance } from "./wallet"
import { storeUrlFor } from "./storeSettings"

type TgUpdate = { update_id: number; message?: { message_id: number; text?: string; chat: { id: number; type: string; title?: string; username?: string; first_name?: string } } }
type Actor = { kind: "owner" } | { kind: "admin"; admin: Admin } | { kind: "guest" }

const HELP = [
	"<b>دستورات</b>",
	"/status — وضعیت سرورها",
	"/clients — خلاصه کلاینت‌ها",
	"/client &lt;نام&gt; — جستجو و نمایش کلاینت",
	"/expiring — کلاینت‌های نزدیک به انقضا (۳ روز)",
	"/incidents — رخدادهای باز (مالک)",
	"/backup — بکاپ فوری دیتابیس (مالک)",
	"/shop — لینک فروشگاه و سفارش‌های امروز",
	"/wallet — موجودی کیف پول (نماینده)",
	"/id — نمایش شناسه این چت",
].join("\n")

async function resolveActor(chatId: string, ownerChatId: string): Promise<Actor> {
	if (ownerChatId && chatId === ownerChatId) return { kind: "owner" }
	const admin = await prisma.admin.findFirst({ where: { telegramId: chatId, isActive: true } })
	if (admin) return admin.role === "OWNER" ? { kind: "owner" } : { kind: "admin", admin }
	return { kind: "guest" }
}

const scopeOf = (a: Actor) => (a.kind === "admin" ? { adminId: a.admin.id } : {})

function clientLine(c: { name: string; status: string; usedUp: bigint; usedDown: bigint; trafficLimit: bigint; expiresAt: Date | null; subToken: string }, withLink = false): string {
	const used = Number(c.usedUp + c.usedDown)
	const lim = Number(c.trafficLimit)
	const icon = c.status === "ACTIVE" ? "🟢" : c.status === "EXPIRED" ? "⛔️" : c.status === "LIMITED" ? "📛" : "⚪️"
	const lines = [
		`${icon} <b>${tgEscape(c.name)}</b> — ${c.status}`,
		`📦 ${formatBytes(used)}${lim > 0 ? ` / ${formatBytes(lim)} (${Math.min(100, Math.round((used / lim) * 100))}%)` : " / نامحدود"}`,
		`📅 ${fmtDate(c.expiresAt, false)}`,
	]
	if (withLink) lines.push(`🔗 ${panelUrl()}/s/${c.subToken}`)
	return lines.join("\n")
}

async function handleCommand(actor: Actor, chatId: string, text: string): Promise<string> {
	const [rawCmd = "", ...rest] = text.trim().split(/\s+/)
	const cmd = rawCmd.toLowerCase().replace(/@.*$/, "")
	const arg = rest.join(" ").trim()

	if (cmd === "/id") return `🆔 شناسه این چت: <code>${chatId}</code>`
	if (cmd === "/start" && /^store_[a-z0-9_-]+$/i.test(arg)) {
		const slug = arg.slice(6).toLowerCase()
		const st = await prisma.storeSettings.findUnique({ where: { slug }, include: { admin: { include: { brand: true } } } })
		if (!st || !st.enabled) return "فروشگاه پیدا نشد یا غیرفعال است."
		const url = storeUrlFor(st, st.admin.brand?.customDomain)
		return `🛒 <b>${tgEscape(st.title || st.admin.brand?.name || brandName())}</b>\nبرای خرید و تمدید اشتراک روی لینک زیر بزنید:\n${url}?tg=${chatId}\n\n🆔 شناسه تلگرام شما: <code>${chatId}</code>`
	}
	if (cmd === "/start") {
		const who =
			actor.kind === "guest"
				? "⚠️ این چت هنوز مجاز نیست. شناسه زیر را در پنل (ادمین ← شناسه تلگرام یا تنظیمات ← یکپارچه‌سازی) وارد کنید:"
				: actor.kind === "owner"
					? "👑 شما مالک پنل هستید."
					: `🧑‍💼 ادمین: ${tgEscape(actor.admin.displayName || actor.admin.username)}`
		return `👋 به بات <b>${tgEscape(brandName())}</b> خوش آمدید.\n${who}\n🆔 <code>${chatId}</code>\n\n${actor.kind === "guest" ? "" : HELP}`
	}
	if (actor.kind === "guest") return `⛔️ دسترسی ندارید.\n🆔 شناسه چت: <code>${chatId}</code>`
	if (cmd === "/help") return HELP

	if (cmd === "/shop") {
		const adminId = actor.kind === "owner" ? (await prisma.admin.findFirst({ where: { role: "OWNER" }, select: { id: true } }))?.id : actor.admin.id
		if (!adminId) return "مالک پیدا نشد."
		const st = await prisma.storeSettings.findUnique({ where: { adminId }, include: { admin: { include: { brand: true } } } })
		if (!st) return "فروشگاه هنوز راه‌اندازی نشده است. از پنل ← فروشگاه فعال کنید."
		const since = new Date(); since.setHours(0, 0, 0, 0)
		const [today, review, revenue] = await Promise.all([
			prisma.order.count({ where: { adminId, createdAt: { gte: since } } }),
			prisma.payment.count({ where: { adminId, kind: "ORDER", status: "REVIEW" } }),
			prisma.order.aggregate({ where: { adminId, status: { in: ["PAID", "FULFILLED"] }, createdAt: { gte: since } }, _sum: { amount: true } }),
		])
		return `🛒 <b>فروشگاه</b> — ${st.enabled ? "🟢 فعال" : "⚪️ غیرفعال"}\n🔗 ${storeUrlFor(st, st.admin.brand?.customDomain)}\n\n📦 سفارش امروز: <b>${today}</b>\n💰 فروش امروز: <b>${Number(revenue._sum.amount ?? 0n).toLocaleString("en-US")}</b> تومان\n🧾 در انتظار بررسی: <b>${review}</b>\n\nمدیریت: ${panelUrl()}/orders`
	}

	if (cmd === "/wallet") {
		if (actor.kind === "owner") return "👑 مالک پنل اعتبار نامحدود دارد."
		const bal = await walletBalance(actor.admin.id)
		const pending = await prisma.payment.count({ where: { adminId: actor.admin.id, kind: "TOPUP", status: { in: ["PENDING", "REVIEW"] } } })
		return `💳 <b>کیف پول</b>\nموجودی: <b>${Number(bal).toLocaleString("en-US")}</b> تومان${pending ? `\nشارژ در انتظار: ${pending}` : ""}\n\nشارژ: ${panelUrl()}/wallet`
	}

	if (cmd === "/status") {
		const where = actor.kind === "owner" ? {} : { adminAccess: { some: { adminId: actor.admin.id } } }
		const servers = await prisma.server.findMany({ where, orderBy: { name: "asc" }, include: { _count: { select: { clients: true } } } })
		if (!servers.length) return "سروری ثبت نشده است."
		const lines = servers.map((s) => {
			const st = s.statusJson as { cpu?: number } | null
			const icon = s.status === "ONLINE" ? "🟢" : s.status === "AUTH_ERROR" ? "🟠" : s.status === "OFFLINE" ? "🔴" : "⚪️"
			return `${icon} <b>${tgEscape(s.name)}</b> — ${s.status}${st?.cpu != null ? ` · CPU ${Math.round(st.cpu)}%` : ""} · 👥 ${s._count.clients}${s.lastSeenAt ? `\n   └ آخرین بررسی: ${fmtDate(s.lastSeenAt)}` : ""}`
		})
		const online = servers.filter((s) => s.status === "ONLINE").length
		return `🖥 <b>سرورها</b> (${online}/${servers.length} آنلاین)\n\n${lines.join("\n")}`
	}

	if (cmd === "/clients") {
		const scope = scopeOf(actor)
		const groups = await prisma.client.groupBy({ by: ["status"], where: scope, _count: { _all: true } })
		const count = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0
		const total = groups.reduce((a, g) => a + g._count._all, 0)
		const online = await prisma.client.count({ where: { ...scope, lastOnlineAt: { gte: new Date(Date.now() - 3 * 60_000) } } })
		const agg = await prisma.client.aggregate({ where: scope, _sum: { usedUp: true, usedDown: true } })
		const used = Number(agg._sum.usedUp ?? 0n) + Number(agg._sum.usedDown ?? 0n)
		return [
			"👥 <b>کلاینت‌ها</b>",
			`• کل: ${total}`,
			`• 🟢 فعال: ${count("ACTIVE")}`,
			`• ⛔️ منقضی: ${count("EXPIRED")}`,
			`• 📛 حجم تمام: ${count("LIMITED")}`,
			`• ⚪️ غیرفعال: ${count("DISABLED")}`,
			`• 📡 آنلاین الان: ${online}`,
			`• 📦 مصرف کل: ${formatBytes(used)}`,
		].join("\n")
	}

	if (cmd === "/client") {
		if (!arg) return "نام کلاینت را بنویسید: <code>/client ali</code>"
		const items = await prisma.client.findMany({ where: { ...scopeOf(actor), name: { contains: arg, mode: "insensitive" } }, take: 5, orderBy: { updatedAt: "desc" } })
		if (!items.length) return "کلاینتی با این نام پیدا نشد."
		return items.map((c) => clientLine(c, true)).join("\n\n")
	}

	if (cmd === "/expiring") {
		const items = await prisma.client.findMany({
			where: { ...scopeOf(actor), status: "ACTIVE", expiresAt: { gt: new Date(), lte: new Date(Date.now() + 3 * 86_400_000) } },
			take: 20,
			orderBy: { expiresAt: "asc" },
		})
		if (!items.length) return "کلاینتی در ۳ روز آینده منقضی نمی‌شود. ✅"
		return `⏳ <b>نزدیک به انقضا</b> (${items.length})\n\n` + items.map((c) => clientLine(c)).join("\n\n")
	}

	if (cmd === "/incidents") {
		if (actor.kind !== "owner") return "فقط مالک پنل مجاز است."
		const open = await prisma.incident.findMany({ where: { status: "OPEN" }, include: { server: { select: { name: true } } }, orderBy: { startedAt: "desc" }, take: 20 })
		if (!open.length) return "🟢 رخداد بازی وجود ندارد."
		return `🚨 <b>رخدادهای باز</b> (${open.length})\n\n` + open.map((i) => `${INCIDENT_LABEL[i.kind].emoji} <b>${tgEscape(i.server.name)}</b> — ${INCIDENT_LABEL[i.kind].fa}\n🕒 ${fmtDate(i.startedAt)}`).join("\n\n")
	}

	if (cmd === "/backup") {
		if (actor.kind !== "owner") return "فقط مالک پنل مجاز است."
		try {
			const b = await runBackup("telegram")
			return b.status === "OK"
				? `✅ بکاپ ساخته شد: <code>${b.fileName}</code> (${formatBytes(Number(b.sizeBytes ?? 0n))})${b.sentToTelegram ? "\n📤 فایل ارسال شد." : ""}`
				: `❌ بکاپ ناموفق: ${tgEscape(b.error)}`
		} catch (err) {
			return `❌ ${tgEscape(err instanceof Error ? err.message : String(err))}`
		}
	}

	return `دستور ناشناخته.\n${HELP}`
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const COMMANDS = [
	{ command: "status", description: "وضعیت سرورها" },
	{ command: "clients", description: "خلاصه کلاینت‌ها" },
	{ command: "client", description: "جستجوی کلاینت" },
	{ command: "expiring", description: "نزدیک به انقضا" },
	{ command: "incidents", description: "رخدادهای باز" },
	{ command: "backup", description: "بکاپ فوری" },
	{ command: "id", description: "شناسه چت" },
]

/** Long-polling loop. Resolves when `signal` aborts. */
export async function pollTelegram(signal: AbortSignal, log: (msg: string) => void = () => undefined): Promise<void> {
	let offset = 0
	let activeToken = ""
	while (!signal.aborted) {
		const s = await getTelegramSettings()
		if (!s.enabled || !s.botEnabled || !s.botToken) {
			await sleep(15_000)
			continue
		}
		if (s.botToken !== activeToken) {
			const me = await tgCall<{ username: string }>(s.botToken, "getMe")
			if (!me.ok) {
				log(`telegram bot: invalid token (${me.error})`)
				await sleep(60_000)
				continue
			}
			activeToken = s.botToken
			offset = 0
			await tgCall(activeToken, "deleteWebhook", { drop_pending_updates: false })
			await tgCall(activeToken, "setMyCommands", { commands: COMMANDS })
			log(`telegram bot online: @${me.result.username}`)
		}
		const r = await tgCall<TgUpdate[]>(activeToken, "getUpdates", { offset, timeout: 25, allowed_updates: ["message"] })
		if (!r.ok) {
			log(`telegram getUpdates: ${r.error}`)
			await sleep(/409|conflict/i.test(r.error) ? 30_000 : 10_000)
			continue
		}
		for (const u of r.result) {
			offset = Math.max(offset, u.update_id + 1)
			const msg = u.message
			if (!msg?.text || !msg.text.startsWith("/")) continue
			const chatId = String(msg.chat.id)
			try {
				const actor = await resolveActor(chatId, s.chatId)
				const reply = await handleCommand(actor, chatId, msg.text)
				await tgCall(activeToken, "sendMessage", { chat_id: chatId, text: reply.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: msg.message_id })
			} catch (err) {
				log(`telegram command failed: ${err instanceof Error ? err.message : String(err)}`)
			}
		}
	}
}
