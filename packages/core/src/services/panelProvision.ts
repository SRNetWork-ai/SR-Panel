/**
 * Fulfilment of a \u00abshared panel\u00bb order: instead of a subscription the buyer
 * receives their own reseller account (role ADMIN) on this install.
 *
 * `createAdmin` is owner-only, so the account is written through prisma directly
 * and stays owned by the seller (`createdById`). Handing the credentials over and
 * the password reset live in `panelHandoff`.
 */
import { prisma, type Admin, type Order } from "@srpanel/db"
import { hashPassword } from "../security/password"
import { DAY_MS, gbToBytes } from "../util/bytes"
import { audit } from "./audit"
import { assertFeature } from "./licensing"
import { notify } from "./notifications"
import { deliverPanelAccount, freePanelUsername, newPanelPassword, parkPanelHandoff, NL, type PanelHandoff, type PanelPackage } from "./panelHandoff"
import { buyerKeyOf, buyerRefOf, panelPlanBook, savePanelPlanBook, type PanelAccount, type PanelPlanLink } from "./panelPlans"
import type { PlanSnapshot } from "./payments"
import { panelUrl } from "./settings"
import { tgEscape } from "./telegram"
import { emitEvent } from "./webhooks"

/** Inbounds of the sold plan, grouped the way `AdminServerAccess` stores them. */
function accessOf(snap: PlanSnapshot | null): Array<{ serverId: string; inboundIds: number[] }> {
	const byServer = new Map<string, number[]>()
	for (const t of snap?.targets ?? []) {
		const ids = byServer.get(t.serverId) ?? []
		if (!ids.includes(t.inboundId)) ids.push(t.inboundId)
		byServer.set(t.serverId, ids)
	}
	return [...byServer.entries()].map(([serverId, inboundIds]) => ({ serverId, inboundIds }))
}

/**
 * Called by `fulfillOrder` when the ordered plan is linked to a panel package.
 * The error handling mirrors a normal fulfilment: the order keeps its status and
 * carries the message in `error` when anything fails.
 */
export async function provisionPanelOrder(order: Order, seller: Admin, link: PanelPlanLink): Promise<Order> {
	const snap = order.planSnapshot as unknown as PlanSnapshot | null
	try {
		await assertFeature("sharedPanel")
		const gb = link.gb > 0 ? link.gb : (snap?.trafficGB ?? 0)
		const days = link.days > 0 ? link.days : (snap?.days ?? 0)
		const pkg: PanelPackage = { gb, days, clients: link.clients }
		const now = new Date()
		const book = await panelPlanBook()
		const buyerKey = seller.id + "|" + buyerKeyOf(order)
		const previous = link.topUp ? book.accounts[buyerKey] : undefined
		const existing = previous?.adminId ? await prisma.admin.findUnique({ where: { id: previous.adminId } }) : null
		const renewal = !!(previous && existing && existing.role !== "OWNER")
		let account: PanelAccount
		let password = ""
		if (previous && existing && renewal) {
			// the same buyer tops the very same sub-panel up instead of getting a second one
			const quota = existing.trafficQuota === null || gb <= 0 ? null : existing.trafficQuota + BigInt(gbToBytes(gb))
			const slots = existing.clientLimit === null || link.clients <= 0 ? null : existing.clientLimit + link.clients
			const from = existing.expiresAt && existing.expiresAt.getTime() > now.getTime() ? existing.expiresAt.getTime() : now.getTime()
			await prisma.admin.update({
				where: { id: existing.id },
				data: {
					trafficQuota: quota,
					clientLimit: slots,
					expiresAt: days > 0 ? new Date(from + days * DAY_MS) : null,
					isActive: true,
					telegramId: order.customerTelegramId?.trim() || existing.telegramId,
				},
			})
			account = {
				...previous,
				username: existing.username,
				planId: order.planId ?? previous.planId,
				buyerRef: buyerRefOf(order) || previous.buyerRef,
				lastOrderId: order.id,
				lastAt: now.toISOString(),
				renewals: previous.renewals + 1,
			}
		} else {
			password = newPanelPassword()
			const username = await freePanelUsername(link.prefix)
			const access = link.grantAccess ? accessOf(snap) : []
			const created = await prisma.admin.create({
				data: {
					username,
					passwordHash: hashPassword(password),
					role: "ADMIN",
					displayName: (order.customerName ?? "").trim().slice(0, 60) || null,
					isActive: true,
					trafficQuota: gb > 0 ? BigInt(gbToBytes(gb)) : null,
					clientLimit: link.clients > 0 ? link.clients : null,
					expiresAt: days > 0 ? new Date(now.getTime() + days * DAY_MS) : null,
					telegramId: order.customerTelegramId?.trim() || null,
					createdById: seller.id,
					serverAccess: access.length ? { create: access.map((a) => ({ serverId: a.serverId, inboundIds: a.inboundIds })) } : undefined,
				},
			})
			account = {
				adminId: created.id,
				username: created.username,
				sellerId: seller.id,
				planId: order.planId ?? "",
				buyerKey,
				buyerRef: buyerRefOf(order),
				orderId: order.id,
				createdAt: now.toISOString(),
				lastOrderId: order.id,
				lastAt: now.toISOString(),
				renewals: 0,
			}
		}
		const fresh = await panelPlanBook()
		await savePanelPlanBook({ ...fresh, accounts: { ...fresh.accounts, [buyerKey]: account } })
		const handoff: PanelHandoff = {
			orderId: order.id,
			sellerId: seller.id,
			adminId: account.adminId,
			username: account.username,
			password,
			renewal,
			delivered: [],
			createdAt: now.toISOString(),
		}
		handoff.delivered = await deliverPanelAccount(order, handoff, pkg)
		// nothing reached the buyer: park the credentials for the seller to hand over
		if (!handoff.delivered.length) await parkPanelHandoff(handoff)
		const note = [order.note ?? "", "\\u0632\\u06cc\\u0631\\u067e\\u0646\\u0644: " + account.username].filter(Boolean).join(" | ").slice(0, 500)
		const done = await prisma.order.update({ where: { id: order.id }, data: { status: "FULFILLED", fulfilledAt: now, error: null, note } })
		if (order.planId) await prisma.plan.update({ where: { id: order.planId }, data: { sold: { increment: 1 } } }).catch(() => undefined)
		await audit(seller.id, renewal ? "panel.renew" : "panel.provision", account.adminId, {
			orderId: order.id,
			username: account.username,
			gb,
			days,
			clients: link.clients,
			delivered: handoff.delivered,
		})
		await emitEvent(seller.id, "order.fulfilled", {
			orderId: order.id,
			panelAdminId: account.adminId,
			username: account.username,
			amount: order.amount.toString(),
			plan: snap?.name ?? "",
		})
		await notify(
			"order.fulfilled",
			[
				"\\ud83c\\udf9b <b>" + (renewal ? "\\u0632\\u06cc\\u0631\\u067e\\u0646\\u0644 \\u0646\\u0645\\u0627\\u06cc\\u0646\\u062f\\u0647 \\u0634\\u0627\\u0631\\u0698 \\u0634\\u062f" : "\\u0632\\u06cc\\u0631\\u067e\\u0646\\u0644 \\u0646\\u0645\\u0627\\u06cc\\u0646\\u062f\\u0647 \\u062a\\u062d\\u0648\\u06cc\\u0644 \\u0634\\u062f") + "</b>",
				"\\u06a9\\u0627\\u0631\\u0628\\u0631\\u06cc: <code>" + tgEscape(account.username) + "</code>",
				"\\u067e\\u0644\\u0646: " + tgEscape(snap?.name ?? "-"),
				"\\u062a\\u062d\\u0648\\u06cc\\u0644 \\u062e\\u0648\\u062f\\u06a9\\u0627\\u0631: " + (handoff.delivered.length ? tgEscape(handoff.delivered.join(", ")) : "\\u0627\\u0646\\u062c\\u0627\\u0645 \\u0646\\u0634\\u062f \\u2014 \\u0627\\u0632 \\u062a\\u0628 \\u00ab\\u067e\\u0646\\u0644 \\u0627\\u0634\\u062a\\u0631\\u0627\\u06a9\\u06cc\\u00bb \\u062a\\u062d\\u0648\\u06cc\\u0644 \\u0628\\u062f\\u0647\\u06cc\\u062f"),
			].join(NL),
			{ dedupeKey: "order:" + order.id + ":panel", targetId: order.id, recipients: { adminId: seller.id } },
		)
		return done
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		const failed = await prisma.order.update({ where: { id: order.id }, data: { error: message.slice(0, 500) } })
		await notify("order.failed", "\\u26a0\\ufe0f <b>\\u062a\\u062d\\u0648\\u06cc\\u0644 \\u0632\\u06cc\\u0631\\u067e\\u0646\\u0644 \\u0646\\u0627\\u0645\\u0648\\u0641\\u0642 \\u0628\\u0648\\u062f</b>" + NL + tgEscape(message) + NL + "\\u0633\\u0641\\u0627\\u0631\\u0634: " + panelUrl() + "/orders", {
			dedupeKey: "order:" + order.id + ":panel_failed:" + Date.now(),
			targetId: order.id,
			recipients: { adminId: seller.id },
		})
		return failed
	}
}
