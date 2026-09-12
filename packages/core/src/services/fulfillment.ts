import { prisma, type Admin, type Order } from "@srpanel/db"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { randomConfigName } from "../util/naming"
import { audit } from "./audit"
import { createClient, resetClientTraffic, subscriptionUrl, updateClient, type ClientTarget } from "./clients"
import { fmtDate, notify } from "./notifications"
import type { PlanSnapshot } from "./payments"
import { planTargets } from "./plans"
import { inboundsOf, listServersFor } from "./servers"
import { listServices } from "./services"
import { brandName, getTelegramSettings, panelUrl } from "./settings"
import { tgEscape, tgSendMessage } from "./telegram"
import { emitEvent } from "./webhooks"

const fmtIrt = (n: bigint | number) => Number(n).toLocaleString("en-US")

/**
 * Inbounds a paid order must be provisioned on.
 *
 * The plan snapshot is the source of truth, but a plan saved without inbounds (or one
 * whose inbounds were later removed from the service) used to hand the buyer an empty
 * subscription. So we degrade: snapshot -> current plan -> the seller's services -> any
 * inbound the seller can still reach. A fulfilled order always carries a real config.
 */
async function resolveOrderTargets(seller: Admin, snap: PlanSnapshot | null, planId: string | null): Promise<{ targets: ClientTarget[]; via: string }> {
	if (snap?.targets?.length) return { targets: snap.targets, via: "snapshot" }
	if (planId) {
		const plan = await prisma.plan.findUnique({ where: { id: planId } })
		const fromPlan = plan ? planTargets(plan) : []
		if (fromPlan.length) return { targets: fromPlan, via: "plan" }
	}
	for (const service of await listServices(seller, { activeOnly: true })) {
		const targets = service.targetInfo.filter((t) => t.enabled).map((t) => ({ serverId: t.serverId, inboundId: t.inboundId }))
		if (targets.length) return { targets, via: `service:${service.name}` }
	}
	for (const server of await listServersFor(seller)) {
		const inbound = inboundsOf(server).find((i) => i.enable !== false)
		if (inbound) return { targets: [{ serverId: server.id, inboundId: inbound.id }], via: `server:${server.name}` }
	}
	throw new AppError("هیچ سرویس یا اینباند فعالی برای تحویل سفارش پیدا نشد؛ برای پلن یک سرویس/اینباند انتخاب کنید")
}

export async function fulfillOrder(orderId: string): Promise<Order> {
	const order = await prisma.order.findUnique({ where: { id: orderId }, include: { admin: true } })
	if (!order) throw new NotFoundError("سفارش پیدا نشد")
	if (order.status === "FULFILLED") return order
	if (order.status !== "PAID") throw new AppError("سفارش هنوز پرداخت نشده است")
	const seller = order.admin
	const snap = order.planSnapshot as unknown as PlanSnapshot
	try {
		let clientId: string
		const warnings: string[] = []
		if (order.renewClientId) {
			const existing = await prisma.client.findFirst({ where: { id: order.renewClientId, adminId: seller.id }, include: { servers: { select: { id: true } } } })
			if (!existing) throw new AppError("کلاینت برای تمدید پیدا نشد")
			await resetClientTraffic(seller, existing.id)
			const { errors } = await updateClient(seller, existing.id, { trafficGB: snap.trafficGB, addDays: snap.days, enabled: true })
			warnings.push(...errors)
			if (!existing.servers.length) warnings.push("این اشتراک هیچ کانفیگی روی پنل ندارد؛ یک سرویس به آن اضافه کنید")
			clientId = existing.id
		} else {
			const { targets, via } = await resolveOrderTargets(seller, snap, order.planId)
			// the buyer never names their own config: a random handle keeps the panel tidy and
			// stops a customer's text («تست») from becoming the config name on every server
			const customer = (order.customerName ?? "").trim()
			const { client, errors } = await createClient(seller, {
				name: randomConfigName(),
				trafficGB: snap.trafficGB,
				days: snap.days,
				ipLimit: snap.ipLimit,
				telegramId: order.customerTelegramId ?? undefined,
				phone: order.customerPhone ?? undefined,
				note: `سفارش فروشگاه #${order.id.slice(-6)} — ${snap.name}${customer ? ` — ${customer}` : ""} [${via}]`,
				targets,
			})
			warnings.push(...errors)
			clientId = client.id
		}
		const error = warnings.length ? warnings.join(" | ").slice(0, 500) : null
		const done = await prisma.order.update({ where: { id: order.id }, data: { status: "FULFILLED", clientId, fulfilledAt: new Date(), error } })
		if (order.planId) await prisma.plan.update({ where: { id: order.planId }, data: { sold: { increment: 1 } } }).catch(() => undefined)
		await audit(seller.id, "order.fulfill", order.id, { clientId, amount: order.amount.toString(), warnings: warnings.length })
		await emitEvent(seller.id, "order.fulfilled", { orderId: order.id, clientId, amount: order.amount.toString(), plan: snap.name })
		await notify(
			"order.fulfilled",
			`🛒 <b>سفارش جدید تحویل شد</b>\nپلن: ${tgEscape(snap.name)}\nمبلغ: <b>${fmtIrt(order.amount)}</b> تومان\nمشتری: ${tgEscape(order.customerName || order.customerTelegramId || order.customerPhone || "-")}`,
			{ dedupeKey: `order:${order.id}:fulfilled`, targetId: order.id, recipients: { adminId: seller.id } },
		)
		if (error) {
			await notify("order.failed", `⚠️ <b>سفارش تحویل شد اما بخشی از کانفیگ‌ها ساخته نشد</b>\n${tgEscape(error)}\nپیگیری: ${panelUrl()}/orders`, {
				dedupeKey: `order:${order.id}:partial`,
				targetId: order.id,
				recipients: { adminId: seller.id },
			})
		}
		await notifyCustomer(done.id)
		return done
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		const failed = await prisma.order.update({ where: { id: order.id }, data: { error: message.slice(0, 500) } })
		await notify("order.failed", `⚠️ <b>تحویل سفارش ناموفق بود</b>\n${tgEscape(message)}\nسفارش: ${panelUrl()}/orders`, { dedupeKey: `order:${order.id}:failed:${Date.now()}`, targetId: order.id, recipients: { adminId: seller.id } })
		return failed
	}
}

async function notifyCustomer(orderId: string): Promise<void> {
	const order = await prisma.order.findUnique({ where: { id: orderId }, include: { client: true, admin: { include: { brand: true } } } })
	if (!order?.client || !order.customerTelegramId) return
	const tg = await getTelegramSettings()
	if (!tg.enabled || !tg.botToken) return
	const sub = subscriptionUrl(order.client)
	const page = `${panelUrl()}/s/${order.client.subToken}`
	const text = `✅ <b>سفارش شما فعال شد</b> — ${tgEscape(order.admin.brand?.name || brandName())}\n\n🔗 لینک اشتراک:\n<code>${tgEscape(sub)}</code>\n\n📱 صفحه اشتراک و آموزش: ${page}\n📅 انقضا: ${fmtDate(order.client.expiresAt, false) || "نامحدود"}`
	await tgSendMessage(text, { chatId: order.customerTelegramId })
}

export async function retryFulfill(actor: Admin, orderId: string): Promise<Order> {
	const order = await prisma.order.findUnique({ where: { id: orderId } })
	if (!order) throw new NotFoundError("سفارش پیدا نشد")
	if (actor.role !== "OWNER" && order.adminId !== actor.id) throw new ForbiddenError()
	if (order.status === "PENDING") {
		// manual confirm without payment (e.g. paid off-platform)
		await prisma.order.update({ where: { id: order.id }, data: { status: "PAID", paidAt: new Date() } })
		await prisma.payment.updateMany({ where: { orderId: order.id, status: { in: ["PENDING", "REVIEW"] } }, data: { status: "CONFIRMED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: "تأیید دستی" } })
		await audit(actor.id, "order.manual_paid", order.id)
	}
	return fulfillOrder(order.id)
}

export async function cancelOrder(actor: Admin, orderId: string): Promise<Order> {
	const order = await prisma.order.findUnique({ where: { id: orderId } })
	if (!order) throw new NotFoundError("سفارش پیدا نشد")
	if (actor.role !== "OWNER" && order.adminId !== actor.id) throw new ForbiddenError()
	if (order.status === "FULFILLED") throw new AppError("سفارش تحویل‌شده را نمی‌توان لغو کرد")
	await prisma.payment.updateMany({ where: { orderId: order.id, status: { in: ["PENDING", "REVIEW"] } }, data: { status: "REJECTED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: "سفارش لغو شد" } })
	const o = await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELED" } })
	await audit(actor.id, "order.cancel", order.id)
	await emitEvent(order.adminId, "order.canceled", { orderId: order.id })
	return o
}
