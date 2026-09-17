/**
 * Bulk client tools + the counters strip of the clients page.
 *
 * Every action is a loop over the *single* client services (`updateClient`,
 * `resetClientTraffic`, `pushClient`, `deleteClientWithRefund`) on purpose: the
 * reseller caps, the wallet billing, the panel push and the audit trail must
 * behave exactly like the one-by-one action. 3x-ui does offer a one-shot
 * /panel/api/clients/bulkAdjust, but the panel would then disagree with our own
 * Client rows - so we pay the extra requests and stay in sync.
 *
 * No schema change: both the selection filters and the counters are derived
 * from the existing Client / ClientServer columns.
 */
import { prisma, type Admin } from "@srpanel/db"
import { z } from "zod"
import { bytesToGb } from "../util/bytes"
import { audit } from "./audit"
import { assertClientKind } from "./clientTypes"
import { clientScope, getClientForActor, pushClient, resetClientTraffic, updateClient } from "./clients"
import { deleteClientWithRefund } from "./refunds"

const DAY_MS = 86_400_000
/** «online» window used by the counters */
const ONLINE_MS = 300_000
/** how long a client must have been expired to count as «stale» */
const STALE_DAYS = 30

/** One request never touches more than this; the UI slices bigger selections. */
export const CLIENT_BULK_MAX = 60

export const CLIENT_BULK_ACTIONS = ["enable", "disable", "addDays", "addGb", "resetTraffic", "repush", "delete"] as const
export type ClientBulkAction = (typeof CLIENT_BULK_ACTIONS)[number]

export const clientBulkFilterSchema = z.object({
	q: z.string().trim().max(120).optional(),
	status: z.enum(["ACTIVE", "EXPIRED", "LIMITED", "DISABLED"]).optional(),
	/** at least one config failed its last push */
	broken: z.boolean().optional(),
	/** no config on any panel */
	orphan: z.boolean().optional(),
	/** expired at least this many days ago */
	expiredBeforeDays: z.number().int().min(0).max(3650).optional(),
})
export type ClientBulkFilter = z.infer<typeof clientBulkFilterSchema>

export const clientBulkSchema = z.object({
	action: z.enum(CLIENT_BULK_ACTIONS),
	/** explicit selection - wins over `filter` */
	ids: z.array(z.string().min(1)).max(CLIENT_BULK_MAX).optional(),
	filter: clientBulkFilterSchema.optional(),
	days: z.number().int().min(-3650).max(3650).optional(),
	gb: z.number().int().min(-1_000_000).max(1_000_000).optional(),
})
export type ClientBulkInput = z.infer<typeof clientBulkSchema>

export interface ClientBulkFailure {
	id: string
	name: string
	message: string
}

export interface ClientBulkResult {
	action: ClientBulkAction
	requested: number
	done: number
	/** left untouched on purpose (an unlimited client keeps its quota) */
	skipped: number
	failed: number
	/** what a bulk delete credited back, as a string because it is a bigint */
	refund: string
	/** panel complaints that did not stop the change */
	warnings: string[]
	errors: ClientBulkFailure[]
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** Mirrors `listClients` so a filter selection matches what the operator sees. */
function bulkWhere(actor: Admin, filter: ClientBulkFilter): Record<string, unknown> {
	const where: Record<string, unknown> = { ...clientScope(actor) }
	if (filter.status) where.status = filter.status
	if (filter.q) {
		where.OR = [
			{ name: { contains: filter.q, mode: "insensitive" } },
			{ tag: { contains: filter.q, mode: "insensitive" } },
			{ note: { contains: filter.q, mode: "insensitive" } },
		]
	}
	// a client without any config has no failing one either, so «orphan» wins
	if (filter.orphan) where.servers = { none: {} }
	else if (filter.broken) where.servers = { some: { lastError: { not: null } } }
	// `lt` never matches a NULL expiry, so «never expires» excludes itself
	if (filter.expiredBeforeDays !== undefined) where.expiresAt = { lt: new Date(Date.now() - filter.expiredBeforeDays * DAY_MS) }
	return where
}

/** The clients this actor really owns, capped at CLIENT_BULK_MAX. */
export async function resolveBulkClients(actor: Admin, input: ClientBulkInput): Promise<Array<{ id: string; name: string }>> {
	if (input.ids && input.ids.length > 0) {
		const where: Record<string, unknown> = { id: { in: input.ids }, ...clientScope(actor) }
		return prisma.client.findMany({ where, select: { id: true, name: true }, take: CLIENT_BULK_MAX })
	}
	if (!input.filter) return []
	const where = bulkWhere(actor, input.filter)
	return prisma.client.findMany({ where, select: { id: true, name: true }, orderBy: { createdAt: "asc" }, take: CLIENT_BULK_MAX })
}

export async function runClientBulk(actor: Admin, input: ClientBulkInput): Promise<ClientBulkResult> {
	const targets = await resolveBulkClients(actor, input)
	const result: ClientBulkResult = { action: input.action, requested: targets.length, done: 0, skipped: 0, failed: 0, refund: "0", warnings: [], errors: [] }
	if (targets.length === 0) return result
	const days = Math.trunc(input.days ?? 0)
	const gb = Math.trunc(input.gb ?? 0)
	// adding nothing is a no-op, not an error
	if ((input.action === "addDays" && days === 0) || (input.action === "addGb" && gb === 0)) {
		result.skipped = targets.length
		return result
	}
	let refund = 0n
	for (const target of targets) {
		try {
			let errors: string[] = []
			switch (input.action) {
				case "enable":
				case "disable":
					errors = (await updateClient(actor, target.id, { enabled: input.action === "enable" })).errors
					result.done++
					break
				case "addDays":
					errors = (await updateClient(actor, target.id, { addDays: days })).errors
					result.done++
					break
				case "addGb": {
					const client = await getClientForActor(actor, target.id)
					// an unlimited client has no quota to grow, and shrinking one to 0 GB
					// would silently turn a limited client into an unlimited one
					if (client.trafficLimit <= 0n) {
						result.skipped++
						break
					}
					const trafficGB = Math.max(1, bytesToGb(client.trafficLimit) + gb)
					await assertClientKind(actor, "LIMITED", null, { trafficGB, excludeClientId: client.id })
					errors = (await updateClient(actor, target.id, { trafficGB })).errors
					result.done++
					break
				}
				case "resetTraffic":
					errors = await resetClientTraffic(actor, target.id)
					result.done++
					break
				case "repush":
					errors = await pushClient(await getClientForActor(actor, target.id))
					result.done++
					break
				case "delete": {
					const deleted = await deleteClientWithRefund(actor, target.id)
					errors = deleted.errors
					refund += deleted.refund
					result.done++
					break
				}
			}
			for (const message of errors.slice(0, 2)) result.warnings.push(`${target.name}: ${message}`)
		} catch (err) {
			result.failed++
			result.errors.push({ id: target.id, name: target.name, message: messageOf(err).slice(0, 200) })
		}
	}
	result.refund = refund.toString()
	if (result.warnings.length > 12) result.warnings = result.warnings.slice(0, 12)
	await audit(actor.id, `client.bulk.${input.action}`, null, {
		requested: result.requested,
		done: result.done,
		skipped: result.skipped,
		failed: result.failed,
		days: input.action === "addDays" ? days : null,
		gb: input.action === "addGb" ? gb : null,
		refund: result.refund,
	})
	return result
}

export interface ClientOverview {
	total: number
	active: number
	expired: number
	limited: number
	disabled: number
	/** active clients expiring within a week */
	expiring: number
	/** seen online in the last few minutes */
	online: number
	/** at least one config failed its last push */
	broken: number
	/** no config on any panel */
	orphan: number
	/** expired more than `staleDays` ago */
	stale: number
	staleDays: number
}

/** Counters for the chips strip and the maintenance card - all actor-scoped. */
export async function clientOverview(actor: Admin): Promise<ClientOverview> {
	const now = Date.now()
	const count = async (extra: Record<string, unknown>): Promise<number> => {
		const where: Record<string, unknown> = { ...clientScope(actor), ...extra }
		return prisma.client.count({ where })
	}
	const [total, active, expired, limited, disabled, expiring, online, broken, orphan, stale] = await Promise.all([
		count({}),
		count({ status: "ACTIVE" }),
		count({ status: "EXPIRED" }),
		count({ status: "LIMITED" }),
		count({ status: "DISABLED" }),
		count({ status: "ACTIVE", expiresAt: { gt: new Date(now), lte: new Date(now + 7 * DAY_MS) } }),
		count({ lastOnlineAt: { gte: new Date(now - ONLINE_MS) } }),
		count({ servers: { some: { lastError: { not: null } } } }),
		count({ servers: { none: {} } }),
		count({ expiresAt: { lt: new Date(now - STALE_DAYS * DAY_MS) } }),
	])
	return { total, active, expired, limited, disabled, expiring, online, broken, orphan, stale, staleDays: STALE_DAYS }
}
