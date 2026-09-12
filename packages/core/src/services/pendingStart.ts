import { prisma } from "@srpanel/db"

/**
 * "Start after first use" (delayed start).
 *
 * 3x-ui reads a *negative* expiryTime as "count the duration from the first
 * connection", so the remote client is created with -(days × 86_400_000) while our
 * own `Client.expiresAt` stays null until the customer actually shows up. The
 * pending duration lives in the generic Setting table — no migration needed — and
 * the worker turns it into a real date as soon as traffic appears.
 */

const PREFIX = "client:startAfterUse:"
const DAY = 86_400_000
/** Marker kept in the operator note so an empty expiry column is self-explanatory. */
const NOTE_TAG = "⏳ شروع پس از اولین اتصال"

export type PendingStart = {
	/** duration in days, applied at the first connection */
	days: number
	/** when the delayed start was armed (ISO) */
	armedAt: string
}

const keyOf = (clientId: string) => PREFIX + clientId

function parse(value: unknown): PendingStart | null {
	const v = (value ?? {}) as { days?: unknown; armedAt?: unknown }
	const days = Math.floor(Number(v.days ?? 0))
	if (!Number.isFinite(days) || days <= 0) return null
	return { days, armedAt: typeof v.armedAt === "string" ? v.armedAt : new Date().toISOString() }
}

export async function setPendingStart(clientId: string, days: number): Promise<PendingStart> {
	const value: PendingStart = { days: Math.max(1, Math.min(3650, Math.floor(days))), armedAt: new Date().toISOString() }
	await prisma.setting.upsert({ where: { key: keyOf(clientId) }, create: { key: keyOf(clientId), value: value as any }, update: { value: value as any } })
	return value
}

export async function getPendingStart(clientId: string): Promise<PendingStart | null> {
	const row = await prisma.setting.findUnique({ where: { key: keyOf(clientId) } })
	return row ? parse(row.value) : null
}

/** Bulk variant for list screens. */
export async function pendingStarts(clientIds: string[]): Promise<Map<string, PendingStart>> {
	const out = new Map<string, PendingStart>()
	if (!clientIds.length) return out
	const rows = await prisma.setting.findMany({ where: { key: { in: clientIds.map(keyOf) } } })
	for (const row of rows) {
		const parsed = parse(row.value)
		if (parsed) out.set(row.key.slice(PREFIX.length), parsed)
	}
	return out
}

export async function clearPendingStart(clientId: string): Promise<void> {
	await prisma.setting.deleteMany({ where: { key: keyOf(clientId) } })
}

/** The value 3x-ui expects for a delayed start (negative ms), or null when not pending. */
export function pendingExpiryMs(pending: PendingStart | null): number | null {
	return pending ? -Math.abs(pending.days) * DAY : null
}

export function withPendingNote(note: string | null | undefined, days: number): string | null {
	const base = withoutPendingNote((note ?? "").trim() || null)
	const tag = NOTE_TAG + " (" + days + " روز)"
	return base ? base + "\n" + tag : tag
}

export function withoutPendingNote(note: string | null): string | null {
	if (!note) return null
	const kept = note
		.split("\n")
		.filter((line) => !line.includes(NOTE_TAG))
		.join("\n")
		.trim()
	return kept || null
}

/**
 * Worker step: the moment a pending client reports traffic (or an online timestamp)
 * its real expiry is written, counted from when it first connected.
 */
export async function activatePendingStarts(limit = 500): Promise<number> {
	const rows = await prisma.setting.findMany({ where: { key: { startsWith: PREFIX } }, take: Math.max(1, limit) })
	let activated = 0
	for (const row of rows) {
		const pending = parse(row.value)
		const clientId = row.key.slice(PREFIX.length)
		const client = await prisma.client.findUnique({
			where: { id: clientId },
			select: { id: true, note: true, usedUp: true, usedDown: true, lastOnlineAt: true, expiresAt: true },
		})
		// gone, broken, or already given a real expiry by hand -> stop tracking it
		if (!client || !pending || client.expiresAt) {
			await prisma.setting.deleteMany({ where: { key: row.key } })
			continue
		}
		const used = Number(client.usedUp) + Number(client.usedDown)
		if (used <= 0 && !client.lastOnlineAt) continue
		const from = client.lastOnlineAt ? client.lastOnlineAt.getTime() : Date.now()
		await prisma.client.update({
			where: { id: client.id },
			data: { expiresAt: new Date(from + pending.days * DAY), note: withoutPendingNote(client.note) },
		})
		await prisma.setting.deleteMany({ where: { key: row.key } })
		activated++
	}
	return activated
}
