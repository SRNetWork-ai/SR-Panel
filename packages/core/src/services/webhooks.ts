import { createHmac } from "node:crypto"
import { prisma, type Webhook } from "@srpanel/db"
import { randomToken } from "../security/token"
import { jsonSafe } from "../util/serialize"
import { NotFoundError } from "../util/errors"

export const WEBHOOK_EVENTS = [
	"client.create", "client.update", "client.delete", "client.reset_traffic", "client.expired", "client.limited",
	"admin.create", "admin.update", "admin.delete",
	"auth.login", "auth.login_failed",
	"server.incident_opened", "server.incident_resolved",
	"backup.completed", "backup.failed",
	"order.created", "order.paid", "order.fulfilled", "order.canceled",
	"payment.review", "payment.rejected", "wallet.topup",
] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

const MAX_ATTEMPTS = 6
let hookCountCache: { at: number; n: number } | null = null

async function anyHooks(): Promise<boolean> {
	if (hookCountCache && Date.now() - hookCountCache.at < 30_000) return hookCountCache.n > 0
	const n = await prisma.webhook.count({ where: { isActive: true } })
	hookCountCache = { at: Date.now(), n }
	return n > 0
}
export const invalidateWebhookCache = () => { hookCountCache = null }

export function signPayload(secret: string, body: string): string {
	return "sha256=" + createHmac("sha256", secret).update(body).digest("hex")
}

async function enrich(event: string, target: string | null): Promise<Record<string, unknown>> {
	if (event.startsWith("client.") && target) {
		const c = await prisma.client.findUnique({ where: { id: target }, select: { id: true, name: true, uuid: true, status: true, trafficLimit: true, usedUp: true, usedDown: true, expiresAt: true, ipLimit: true, note: true, adminId: true, createdAt: true } })
		if (c) return { client: jsonSafe(c) }
	}
	return {}
}

/** Queues an event for every matching webhook. Owner hooks get everything, admin hooks only their own events. */
export async function emitEvent(adminId: string | null, event: string, payload: Record<string, unknown> = {}): Promise<void> {
	if (!(await anyHooks())) return
	const hooks = await prisma.webhook.findMany({
		where: { isActive: true, OR: [{ admin: { role: "OWNER" } }, ...(adminId ? [{ adminId }] : [])] },
		select: { id: true, events: true },
	})
	const targets = hooks.filter((h) => h.events.length === 0 || h.events.includes(event))
	if (!targets.length) return
	const extra = await enrich(event, typeof payload.target === "string" ? payload.target : null)
	const body = jsonSafe({ event, at: new Date().toISOString(), adminId, ...payload, ...extra })
	await prisma.webhookDelivery.createMany({ data: targets.map((h) => ({ webhookId: h.id, event, payload: body })) })
}

async function deliver(hook: Pick<Webhook, "id" | "url" | "secret">, event: string, payload: unknown, deliveryId: string): Promise<{ status: number | null; error: string | null }> {
	const body = JSON.stringify(payload)
	try {
		const res = await fetch(hook.url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"user-agent": "SRPanel-Webhook/1.0",
				"x-srp-event": event,
				"x-srp-delivery": deliveryId,
				"x-srp-signature": signPayload(hook.secret, body),
			},
			body,
			signal: AbortSignal.timeout(10_000),
			redirect: "manual",
		})
		return { status: res.status, error: res.ok ? null : `HTTP ${res.status}` }
	} catch (err) {
		return { status: null, error: err instanceof Error ? err.message : String(err) }
	}
}

/** Worker job: sends due deliveries with exponential backoff. Returns processed count. */
export async function dispatchWebhooks(limit = 25): Promise<number> {
	const due = await prisma.webhookDelivery.findMany({
		where: { doneAt: null, nextAt: { lte: new Date() }, attempts: { lt: MAX_ATTEMPTS } },
		orderBy: { nextAt: "asc" },
		take: limit,
		include: { webhook: true },
	})
	for (const d of due) {
		if (!d.webhook.isActive) {
			await prisma.webhookDelivery.update({ where: { id: d.id }, data: { doneAt: new Date(), error: "webhook disabled" } })
			continue
		}
		const r = await deliver(d.webhook, d.event, d.payload, d.id.toString())
		const attempts = d.attempts + 1
		const success = r.status !== null && r.status >= 200 && r.status < 300
		const giveUp = !success && attempts >= MAX_ATTEMPTS
		await prisma.$transaction([
			prisma.webhookDelivery.update({
				where: { id: d.id },
				data: {
					attempts,
					status: r.status,
					error: r.error,
					doneAt: success || giveUp ? new Date() : null,
					nextAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000),
				},
			}),
			prisma.webhook.update({
				where: { id: d.webhookId },
				data: { lastStatus: r.status, lastError: r.error, lastFiredAt: new Date(), failCount: success ? 0 : { increment: 1 } },
			}),
		])
	}
	// keep the queue small
	await prisma.webhookDelivery.deleteMany({ where: { doneAt: { lt: new Date(Date.now() - 14 * 86_400_000) } } })
	return due.length
}

/* ---------- management ---------- */

export interface WebhookInput { url: string; events?: string[]; isActive?: boolean }

export async function listWebhooks(adminId: string) {
	return prisma.webhook.findMany({ where: { adminId }, orderBy: { createdAt: "desc" } })
}

export async function createWebhook(adminId: string, input: WebhookInput) {
	invalidateWebhookCache()
	return prisma.webhook.create({ data: { adminId, url: input.url, events: input.events ?? [], isActive: input.isActive ?? true, secret: randomToken(24) } })
}

export async function updateWebhook(adminId: string, id: string, input: Partial<WebhookInput>) {
	const hook = await prisma.webhook.findFirst({ where: { id, adminId } })
	if (!hook) throw new NotFoundError("وب‌هوک پیدا نشد")
	invalidateWebhookCache()
	return prisma.webhook.update({ where: { id }, data: { url: input.url, events: input.events, isActive: input.isActive } })
}

export async function deleteWebhook(adminId: string, id: string) {
	const hook = await prisma.webhook.findFirst({ where: { id, adminId } })
	if (!hook) throw new NotFoundError("وب‌هوک پیدا نشد")
	invalidateWebhookCache()
	await prisma.webhook.delete({ where: { id } })
}

/** Sends a synchronous ping so the user can verify the endpoint. */
export async function testWebhook(adminId: string, id: string) {
	const hook = await prisma.webhook.findFirst({ where: { id, adminId } })
	if (!hook) throw new NotFoundError("وب‌هوک پیدا نشد")
	const r = await deliver(hook, "ping", { event: "ping", at: new Date().toISOString(), message: "SRPanel webhook test" }, "test")
	await prisma.webhook.update({ where: { id }, data: { lastStatus: r.status, lastError: r.error, lastFiredAt: new Date() } })
	return r
}
