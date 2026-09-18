import { prisma, type Admin } from "@srpanel/db"
import { AppError } from "../util/errors"
import { audit } from "./audit"
import { getClientForActor, pushClient, resetClientTraffic } from "./clients"

/**
 * Auto-renew — «تمدید/ریست خودکار دوره‌ای».
 *
 * 3x-ui has `reset` / `resetDay` on an inbound; SRPanel needs the same idea per
 * client and across every panel a client lives on: every `everyDays` days the
 * traffic counters are reset (locally and on each panel) and — optionally — the
 * expiry is pushed forward by one cycle. `maxCycles` stops the loop after N
 * renewals; 0 keeps it running forever.
 *
 * Like the delayed-start timers this lives in the generic `Setting` table, so
 * there is no migration and no change to the Client model.
 */

const PREFIX = "client:autoRenew:"
const DAY = 86_400_000

export type AutoRenewRule = {
	/** cycle length in days (1…365) */
	everyDays: number
	/** stop after this many renewals — 0 means never stop */
	maxCycles: number
	/** renewals already applied */
	cycles: number
	/** also push `expiresAt` forward by one cycle on every reset */
	extendExpiry: boolean
	/** when the next reset is due (ISO) */
	nextAt: string
	/** when the last reset ran (ISO), null while none ran yet */
	lastAt: string | null
}

export type AutoRenewInput = {
	everydays?: never
	everyDays: number
	maxCycles?: number
	extendExpiry?: boolean
	/** first reset; defaults to now + everyDays */
	startAt?: string | null
}

export type AutoRenewTick = { reset: number; finished: number; failed: number }

const keyOf = (clientId: string) => PREFIX + clientId
const clampDays = (n: number) => Math.min(365, Math.max(1, Math.floor(Number(n) || 1)))
const clampInt = (n: unknown) => {
	const v = Math.floor(Number(n ?? 0))
	return Number.isFinite(v) && v > 0 ? v : 0
}

function parse(value: unknown): AutoRenewRule | null {
	const v = (value ?? {}) as Record<string, unknown>
	const everyDays = Math.floor(Number(v.everyDays ?? 0))
	if (!Number.isFinite(everyDays) || everyDays <= 0) return null
	return {
		everyDays: Math.min(365, everyDays),
		maxCycles: clampInt(v.maxCycles),
		cycles: clampInt(v.cycles),
		extendExpiry: v.extendExpiry !== false,
		nextAt: typeof v.nextAt === "string" ? v.nextAt : new Date(Date.now() + everyDays * DAY).toISOString(),
		lastAt: typeof v.lastAt === "string" ? v.lastAt : null,
	}
}

async function write(clientId: string, rule: AutoRenewRule): Promise<AutoRenewRule> {
	await prisma.setting.upsert({
		where: { key: keyOf(clientId) },
		create: { key: keyOf(clientId), value: rule as any },
		update: { value: rule as any },
	})
	return rule
}

export async function getAutoRenew(clientId: string): Promise<AutoRenewRule | null> {
	const row = await prisma.setting.findUnique({ where: { key: keyOf(clientId) } })
	return row ? parse(row.value) : null
}

/** Bulk variant for list screens. */
export async function autoRenews(clientIds: string[]): Promise<Map<string, AutoRenewRule>> {
	const out = new Map<string, AutoRenewRule>()
	if (!clientIds.length) return out
	const rows = await prisma.setting.findMany({ where: { key: { in: clientIds.map(keyOf) } } })
	for (const row of rows) {
		const parsed = parse(row.value)
		if (parsed) out.set(row.key.slice(PREFIX.length), parsed)
	}
	return out
}

/** Arms or edits the cycle. The actor must be allowed to see the client. */
export async function setAutoRenew(actor: Admin, clientId: string, input: AutoRenewInput): Promise<AutoRenewRule> {
	const client = await getClientForActor(actor, clientId)
	const everyDays = clampDays(input.everyDays)
	const prev = await getAutoRenew(client.id)
	const asked = input.startAt ? new Date(input.startAt) : null
	const nextAt = asked && !Number.isNaN(asked.getTime()) ? asked : new Date(Date.now() + everyDays * DAY)
	if (nextAt.getTime() < Date.now() - DAY) throw new AppError("تاریخ شروع نمی‌تواند در گذشته باشد")
	const rule: AutoRenewRule = {
		everyDays,
		maxCycles: clampInt(input.maxCycles ?? prev?.maxCycles ?? 0),
		cycles: prev?.cycles ?? 0,
		extendExpiry: input.extendExpiry ?? prev?.extendExpiry ?? true,
		nextAt: nextAt.toISOString(),
		lastAt: prev?.lastAt ?? null,
	}
	await write(client.id, rule)
	await audit(actor.id, "client.auto_renew.set", client.id, { everyDays, maxCycles: rule.maxCycles, extendExpiry: rule.extendExpiry, nextAt: rule.nextAt })
	return rule
}

export async function clearAutoRenew(actor: Admin, clientId: string): Promise<void> {
	const client = await getClientForActor(actor, clientId)
	await prisma.setting.deleteMany({ where: { key: keyOf(client.id) } })
	await audit(actor.id, "client.auto_renew.clear", client.id)
}

/**
 * Worker step. Every due rule resets the client's traffic on all of its panels
 * and, when asked, extends the expiry by one cycle. A panel that refuses is
 * counted as failed but the cycle still moves on, so one dead server cannot
 * turn the job into a hot loop.
 */
export async function runAutoRenew(limit = 200): Promise<AutoRenewTick> {
	const rows = await prisma.setting.findMany({ where: { key: { startsWith: PREFIX } }, take: Math.max(1, limit) })
	const out: AutoRenewTick = { reset: 0, finished: 0, failed: 0 }
	const now = Date.now()
	for (const row of rows) {
		const rule = parse(row.value)
		const clientId = row.key.slice(PREFIX.length)
		const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, adminId: true, expiresAt: true } })
		if (!rule || !client) {
			await prisma.setting.deleteMany({ where: { key: row.key } })
			continue
		}
		if (new Date(rule.nextAt).getTime() > now) continue
		const admin = await prisma.admin.findUnique({ where: { id: client.adminId } })
		if (!admin) {
			await prisma.setting.deleteMany({ where: { key: row.key } })
			continue
		}
		try {
			const errors = await resetClientTraffic(admin, client.id)
			if (errors.length) out.failed++
		} catch {
			out.failed++
		}
		if (rule.extendExpiry) {
			const base = client.expiresAt && client.expiresAt.getTime() > now ? client.expiresAt.getTime() : now
			await prisma.client.update({ where: { id: client.id }, data: { expiresAt: new Date(base + rule.everyDays * DAY) } })
			try {
				await pushClient(await getClientForActor(admin, client.id))
			} catch {
				out.failed++
			}
		}
		const cycles = rule.cycles + 1
		out.reset++
		await audit(admin.id, "client.auto_renew", client.id, { cycle: cycles, everyDays: rule.everyDays, extendExpiry: rule.extendExpiry })
		if (rule.maxCycles > 0 && cycles >= rule.maxCycles) {
			await prisma.setting.deleteMany({ where: { key: row.key } })
			out.finished++
			continue
		}
		await write(client.id, { ...rule, cycles, lastAt: new Date(now).toISOString(), nextAt: new Date(now + rule.everyDays * DAY).toISOString() })
	}
	return out
}
