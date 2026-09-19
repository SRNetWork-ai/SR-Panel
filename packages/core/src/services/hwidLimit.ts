import { prisma } from "@srpanel/db"

/**
 * Per-client device limit - 3x-ui's `limitHwid`.
 *
 * Stored in the generic `Setting` table like the delayed-start timers and the
 * auto-renew rules, so no migration and no change to the Client model.
 *
 * Deliberately a leaf module: `services/clients/panelSync.ts` reads the limit while
 * pushing a client to its panels, so this file must never import the clients service.
 */

const PREFIX = "client:hwid:"

/** Panels store an int; anything above this is almost certainly a typo. 0 = unlimited. */
export const HWID_MAX = 100

const keyOf = (clientId: string) => PREFIX + clientId

export const clampHwid = (n: unknown): number => {
	const v = Math.floor(Number(n ?? 0))
	return Number.isFinite(v) && v > 0 ? Math.min(HWID_MAX, v) : 0
}

/** Accepts both the `{ limit }` shape and a bare number written by older builds. */
const read = (value: unknown): number => clampHwid((value as Record<string, unknown> | null)?.limit ?? value)

export async function getHwidLimit(clientId: string): Promise<number> {
	const row = await prisma.setting.findUnique({ where: { key: keyOf(clientId) } })
	return row ? read(row.value) : 0
}

/** Bulk variant for list screens. Only clients with a limit appear in the map. */
export async function hwidLimits(clientIds: string[]): Promise<Map<string, number>> {
	const out = new Map<string, number>()
	if (!clientIds.length) return out
	const rows = await prisma.setting.findMany({ where: { key: { in: clientIds.map(keyOf) } } })
	for (const row of rows) {
		const limit = read(row.value)
		if (limit > 0) out.set(row.key.slice(PREFIX.length), limit)
	}
	return out
}

/** 0 removes the row entirely, so "unlimited" never lingers as a stored 0. */
export async function writeHwidLimit(clientId: string, limit: number): Promise<number> {
	const value = clampHwid(limit)
	if (!value) {
		await prisma.setting.deleteMany({ where: { key: keyOf(clientId) } })
		return 0
	}
	await prisma.setting.upsert({
		where: { key: keyOf(clientId) },
		create: { key: keyOf(clientId), value: { limit: value } as any },
		update: { value: { limit: value } as any },
	})
	return value
}
