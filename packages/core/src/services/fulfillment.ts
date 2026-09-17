import { prisma, type Admin, type Order } from "@srpanel/db"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { randomConfigName } from "../util/naming"
import { audit } from "./audit"
import { createClient, resetClientTraffic, subscriptionUrl, updateClient, type ClientTarget } from "./clients"
import { fmtDate, notify } from "./notifications"
import { panelPlanFor } from "./panelPlans"
import { provisionPanelOrder } from "./panelProvision"
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
	throw new AppError("\u0647\u06cc\u0686 \u0633\u0631\u0648\u06cc\u0633 \u06cc\u0627 \u0627\u06cc\u0646\u0628\u0627\u0646\u062f \u0641\u0639\u0627\u0644\u06cc \u0628\u0631\u0627\u06cc \u062a\u062d\u0648\u06cc\u0644 \u0633\u0641\u0627\u0631\u0634 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f\u061b \u0628\u0631\u0627\u06cc \u067e\u0644\u0646 \u06cc\u06a9 \u0633\u0631\u0648\u06cc\u0633/\u0627\u06cc\u0646\u0628\u0627\u0646\u062f \u0627\u0646\u062a\u062e\u0627\u0628 \u06a9\u0646\u06cc\u062f")
}

export async function fulfillOrder(orderId: string): Promise<Order> {
	const order = await prisma.order.findUnique({ where: { id: orderId }, include: { admin: true } })
	if (!order) throw new NotFoundError("\u0633\u0641\u0627\u0631\u0634 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f")
	if (order.status === "FULFILLED") return order
	if (order.status !== "PAID") throw new AppError("\u0633\u0641\u0627\u0631\u0634 \u0647\u0646\u0648\u0632 \u067e\u0631\u062f\u0627\u062e\u062a \u0646\u0634\u062f\u0647 \u0627\u0633\u062a")
	const seller = order.admin
	const snap = order.planSnapshot as unknown as PlanSnapshot
	// a plan linked to a panel package sells a reseller sub-panel instead of a subscription
	const panelLink = await panelPlanFor(order.planId)
	if (panelLink) return provisionPanelOrder(order, seller, panelLink)
	try {
		let clientId: string
		const warnings: string[] = []
		if (order.renewClientId) {
			const existing = await prisma.client.findFirst({ where: { id: order.renewClientId, adminId: seller.id }, include: { servers: { select: { id: true } } } })
			if (!existing) throw new AppError("\u06a9\u0644\u0627\u06cc\u0646\u062a \u0628\u0631\u0627\u06cc \u062a\u0645\u062f\u06cc\u062f \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f")
			await resetClientTraffic(seller, existing.id)
			const { errors } = await updateClient(seller, existing.id, { trafficGB: snap.trafficGB, addDays: snap.days, enabled: true })
			warnings.push(...errors)
			if (!existing.servers.length) warnings.push("\u0627\u06cc\u0646 \u0627\u0634\u062a\u0631\u0627\u06a9 \u0647\u06cc\u0686 \u06a9\u0627\u0646\u0641\u06cc\u06af\u06cc \u0631\u0648\u06cc \u067e\u0646\u0644 \u0646\u062f\u0627\u0631\u062f\u061b \u06cc\u06a9 \u0633\u0631\u0648\u06cc\u0633 \u0628\u0647 \u0622\u0646 \u0627\u0636\u0627\u0641\u0647 \u06a9\u0646\u06cc\u062f")
			clientId = existing.id
		} else {
			const { targets, via } = await resolveOrderTargets(seller, snap, order.planId)
			// the buyer never names their own config: a random handle keeps the panel tidy and
			// stops a customer's text (\u00ab\u062a\u0633\u062a\u00bb) from becoming the config name on every server
			const customer = (order.customerName ?? "").trim()
			const { client, errors } = await createClient(seller, {
				name: randomConfigName(),
				trafficGB: snap.trafficGB,
				days: snap.days,
				ipLimit: snap.ipLimit,
				telegramId: order.customerTelegramId ?? undefined,
				phone: order.customerPhone ?? undefined,
				note: `\u0633\u0641\u0627\u0631\u0634 \u0641\u0631\u0648\u0634\u06af\u0627\u0647 #${order.id.slice(-6)} \u2014 ${snap.name}${customer ? ` \u2014 ${customer}` : ""} [${via}]`,
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
			`\ud83d\uded2 <b>\u0633\u0641\u0627\u0631\u0634 \u062c\u062f\u06cc\u062f \u062a\u062d\u0648\u06cc\u0644 \u0634\u062f</b>\n\u067e\u0644\u0646: ${tgEscape(snap.name)}\n\u0645\u0628\u0644\u063a: <b>${fmtIrt(order.amount)}</b> \u062a\u0648\u0645\u0627\u0646\n\u0645\u0634\u062a\u0631\u06cc: ${tgEscape(order.customerName || order.customerTelegramId || order.customerPhone || "-")}`,
			{ dedupeKey: `order:${order.id}:fulfilled`, targetId: order.id, recipients: { adminId: seller.id } },
		)
		if (error) {
			await notify("order.failed", `\u26a0\ufe0f <b>\u0633\u0641\u0627\u0631\u0634 \u062a\u062d\u0648\u06cc\u0644 \u0634\u062f \u0627\u0645\u0627 \u0628\u062e\u0634\u06cc \u0627\u0632 \u06a9\u0627\u0646\u0641\u06cc\u06af\u200c\u0647\u0627 \u0633\u0627\u062e\u062a\u0647 \u0646\u0634\u062f</b>\n${tgEscape(error)}\n\u067e\u06cc\u06af\u06cc\u0631\u06cc: ${panelUrl()}/orders`, {
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
		await notify("order.failed", `\u26a0\ufe0f <b>\u062a\u062d\u0648\u06cc\u0644 \u0633\u0641\u0627\u0631\u0634 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062f</b>\n${tgEscape(message)}\n\u0633\u0641\u0627\u0631\u0634: ${panelUrl()}/orders`, { dedupeKey: `order:${order.id}:failed:${Date.now()}`, targetId: order.id, recipients: { adminId: seller.id } })
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
	const text = `\u2705 <b>\u0633\u0641\u0627\u0631\u0634 \u0634\u0645\u0627 \u0641\u0639\u0627\u0644 \u0634\u062f</b> \u2014 ${tgEscape(order.admin.brand?.name || brandName())}\n\n\ud83d\udd17 \u0644\u06cc\u0646\u06a9 \u0627\u0634\u062a\u0631\u0627\u06a9:\n<code>${tgEscape(sub)}</code>\n\n\ud83d\udcf1 \u0635\u0641\u062d\u0647 \u0627\u0634\u062a\u0631\u0627\u06a9 \u0648 \u0622\u0645\u0648\u0632\u0634: ${page}\n\ud83d\udcc5 \u0627\u0646\u0642\u0636\u0627: ${fmtDate(order.client.expiresAt, false) || "\u0646\u0627\u0645\u062d\u062f\u0648\u062f"}`
	await tgSendMessage(text, { chatId: order.customerTelegramId })
}

export async function retryFulfill(actor: Admin, orderId: string): Promise<Order> {
	const order = await prisma.order.findUnique({ where: { id: orderId } })
	if (!order) throw new NotFoundError("\u0633\u0641\u0627\u0631\u0634 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f")
	if (actor.role !== "OWNER" && order.adminId !== actor.id) throw new ForbiddenError()
	if (order.status === "PENDING") {
		// manual confirm without payment (e.g. paid off-platform)
		await prisma.order.update({ where: { id: order.id }, data: { status: "PAID", paidAt: new Date() } })
		await prisma.payment.updateMany({ where: { orderId: order.id, status: { in: ["PENDING", "REVIEW"] } }, data: { status: "CONFIRMED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: "\u062a\u0623\u06cc\u06cc\u062f \u062f\u0633\u062a\u06cc" } })
		await audit(actor.id, "order.manual_paid", order.id)
	}
	return fulfillOrder(order.id)
}

export async function cancelOrder(actor: Admin, orderId: string): Promise<Order> {
	const order = await prisma.order.findUnique({ where: { id: orderId } })
	if (!order) throw new NotFoundError("\u0633\u0641\u0627\u0631\u0634 \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f")
	if (actor.role !== "OWNER" && order.adminId !== actor.id) throw new ForbiddenError()
	if (order.status === "FULFILLED") throw new AppError("\u0633\u0641\u0627\u0631\u0634 \u062a\u062d\u0648\u06cc\u0644\u200c\u0634\u062f\u0647 \u0631\u0627 \u0646\u0645\u06cc\u200c\u062a\u0648\u0627\u0646 \u0644\u063a\u0648 \u06a9\u0631\u062f")
	await prisma.payment.updateMany({ where: { orderId: order.id, status: { in: ["PENDING", "REVIEW"] } }, data: { status: "REJECTED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: "\u0633\u0641\u0627\u0631\u0634 \u0644\u063a\u0648 \u0634\u062f" } })
	const o = await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELED" } })
	await audit(actor.id, "order.cancel", order.id)
	await emitEvent(order.adminId, "order.canceled", { orderId: order.id })
	return o
}
