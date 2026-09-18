/**
 * Client types — «حجمی» (LIMITED) and «نامحدود» (UNLIMITED).
 *
 * Who may create which type, which service is offered for which type, and the
 * per-reseller caps (how many unlimited clients, how much traffic per limited
 * client) are owner-configurable and live in the Setting table under the
 * `clientTypes` key — no schema change. A client counts as LIMITED when it has
 * a traffic quota and UNLIMITED when the quota is 0 (the convention the panel
 * already uses for `Client.trafficLimit`).
 */
import { prisma, type Admin } from "@srpanel/db"
import { z } from "zod"
import { AppError, ForbiddenError } from "../util/errors"
import { getSetting, setSetting } from "./settings"

export const CLIENT_TYPES_KEY = "clientTypes"

export const CLIENT_KINDS = ["LIMITED", "UNLIMITED"] as const
export type ClientKind = (typeof CLIENT_KINDS)[number]

/** What a single service may be used for. */
export const SERVICE_KINDS = ["BOTH", "LIMITED", "UNLIMITED"] as const
export type ServiceKind = (typeof SERVICE_KINDS)[number]

export const KIND_LABELS: Record<ClientKind, string> = { LIMITED: "حجمی", UNLIMITED: "نامحدود" }
export const SERVICE_KIND_LABELS: Record<ServiceKind, string> = {
	BOTH: "حجمی و نامحدود",
	LIMITED: "فقط حجمی",
	UNLIMITED: "فقط نامحدود",
}

/** `unlimitedMax` and `limitedMaxGB` both use 0 for «no cap». */
const kindAccessSchema = z.object({
	limited: z.boolean().default(true),
	unlimited: z.boolean().default(false),
	unlimitedMax: z.number().int().min(0).default(0),
	limitedMaxGB: z.number().int().min(0).default(0),
})
export type KindAccess = z.infer<typeof kindAccessSchema>

export const clientTypesSchema = z.object({
	/** applies to every reseller without an explicit row */
	defaultLimited: z.boolean().default(true),
	defaultUnlimited: z.boolean().default(false),
	/** how many unlimited clients a reseller may own — 0 means no cap */
	defaultUnlimitedMax: z.number().int().min(0).default(0),
	/** biggest traffic (GB) a single limited client may get — 0 means no cap */
	defaultLimitedMaxGB: z.number().int().min(0).default(0),
	/** adminId → what that reseller may create */
	admins: z.record(z.string(), kindAccessSchema).default({}),
	/** serviceId → which client types this service is offered for */
	services: z.record(z.string(), z.enum(SERVICE_KINDS)).default({}),
})
export type ClientTypeSettings = z.infer<typeof clientTypesSchema>

export const getClientTypeSettings = () => getSetting(CLIENT_TYPES_KEY, clientTypesSchema)

export interface ClientTypesPatch {
	defaultLimited?: boolean
	defaultUnlimited?: boolean
	defaultUnlimitedMax?: number
	defaultLimitedMaxGB?: number
	admins?: Record<string, { limited?: boolean; unlimited?: boolean; unlimitedMax?: number; limitedMaxGB?: number }>
	services?: Record<string, ServiceKind>
}

const clampInt = (v: number | undefined, fallback: number): number => (v === undefined || !Number.isFinite(v) ? fallback : Math.max(0, Math.floor(v)))

/** Patches the stored maps instead of replacing them. */
export async function saveClientTypes(patch: ClientTypesPatch): Promise<ClientTypeSettings> {
	const cur = await getClientTypeSettings()
	const admins: Record<string, KindAccess> = { ...cur.admins }
	for (const [id, row] of Object.entries(patch.admins ?? {})) {
		const prev = admins[id] ?? { limited: cur.defaultLimited, unlimited: cur.defaultUnlimited, unlimitedMax: cur.defaultUnlimitedMax, limitedMaxGB: cur.defaultLimitedMaxGB }
		admins[id] = {
			limited: row.limited ?? prev.limited,
			unlimited: row.unlimited ?? prev.unlimited,
			unlimitedMax: clampInt(row.unlimitedMax, prev.unlimitedMax),
			limitedMaxGB: clampInt(row.limitedMaxGB, prev.limitedMaxGB),
		}
	}
	return setSetting(CLIENT_TYPES_KEY, clientTypesSchema, {
		defaultLimited: patch.defaultLimited ?? cur.defaultLimited,
		defaultUnlimited: patch.defaultUnlimited ?? cur.defaultUnlimited,
		defaultUnlimitedMax: clampInt(patch.defaultUnlimitedMax, cur.defaultUnlimitedMax),
		defaultLimitedMaxGB: clampInt(patch.defaultLimitedMaxGB, cur.defaultLimitedMaxGB),
		admins,
		services: { ...cur.services, ...(patch.services ?? {}) },
	})
}

/** 0 GB / 0 bytes means «unlimited» everywhere in the panel. */
export const kindFromGB = (gb: number): ClientKind => (gb > 0 ? "LIMITED" : "UNLIMITED")
export const kindFromBytes = (bytes: bigint | number): ClientKind => (BigInt(bytes) > 0n ? "LIMITED" : "UNLIMITED")

type ActorLike = Pick<Admin, "id" | "role">

/** Same rule as `clientScope` in ./clients, inlined so this module imports no sibling service. */
const scopeOf = (actor: ActorLike) => (actor.role === "OWNER" ? {} : { adminId: actor.id })

/** The owner may always create both types and never hits a cap. */
export function kindsOf(settings: ClientTypeSettings, actor: ActorLike): KindAccess {
	if (actor.role === "OWNER") return { limited: true, unlimited: true, unlimitedMax: 0, limitedMaxGB: 0 }
	const row = settings.admins[actor.id]
	return {
		limited: row?.limited ?? settings.defaultLimited,
		unlimited: row?.unlimited ?? settings.defaultUnlimited,
		unlimitedMax: row?.unlimitedMax ?? settings.defaultUnlimitedMax,
		limitedMaxGB: row?.limitedMaxGB ?? settings.defaultLimitedMaxGB,
	}
}

export const serviceKindOf = (settings: ClientTypeSettings, serviceId: string): ServiceKind => settings.services[serviceId] ?? "BOTH"

export function serviceAllowsKind(settings: ClientTypeSettings, serviceId: string, kind: ClientKind): boolean {
	const sk = serviceKindOf(settings, serviceId)
	return sk === "BOTH" || sk === kind
}

/** How many unlimited clients (trafficLimit = 0) this actor already owns. */
export async function countUnlimitedClients(actor: ActorLike, excludeClientId?: string | null): Promise<number> {
	return prisma.client.count({ where: { ...scopeOf(actor), trafficLimit: 0n, ...(excludeClientId ? { id: { not: excludeClientId } } : {}) } })
}

export interface ClientTypeAccess {
	limited: boolean
	unlimited: boolean
	/** 0 means «no cap» for both numbers */
	unlimitedMax: number
	limitedMaxGB: number
	/** unlimited clients this actor already owns */
	unlimitedUsed: number
	/** serviceId → allowed client types; missing means «both» */
	services: Record<string, ServiceKind>
}

/** Everything the clients page needs to pick which «new client» buttons to show. */
export async function clientTypeAccess(actor: ActorLike): Promise<ClientTypeAccess> {
	const settings = await getClientTypeSettings()
	const allowed = kindsOf(settings, actor)
	const unlimitedUsed = allowed.unlimitedMax > 0 ? await countUnlimitedClients(actor) : 0
	return { ...allowed, unlimitedUsed, services: settings.services }
}

export interface AssertKindOptions {
	/** traffic of the client being created or updated, in GB */
	trafficGB?: number
	/** on an update the client must not count against its own cap */
	excludeClientId?: string | null
}

/** Throws when this actor may not create a client of this kind/size on this service. */
export async function assertClientKind(actor: ActorLike, kind: ClientKind, serviceId?: string | null, opts: AssertKindOptions = {}): Promise<void> {
	const settings = await getClientTypeSettings()
	const allowed = kindsOf(settings, actor)
	if (kind === "LIMITED" && !allowed.limited) throw new ForbiddenError("اجازهٔ ساخت کلاینت حجمی را ندارید")
	if (kind === "UNLIMITED" && !allowed.unlimited) throw new ForbiddenError("اجازهٔ ساخت کلاینت نامحدود را ندارید")
	if (kind === "LIMITED" && allowed.limitedMaxGB > 0 && (opts.trafficGB ?? 0) > allowed.limitedMaxGB)
		throw new ForbiddenError(`حجم هر کلاینت حداکثر ${allowed.limitedMaxGB} گیگابایت است`)
	if (kind === "UNLIMITED" && allowed.unlimitedMax > 0) {
		const used = await countUnlimitedClients(actor, opts.excludeClientId)
		if (used >= allowed.unlimitedMax) throw new ForbiddenError(`سقف کلاینت نامحدود شما (${allowed.unlimitedMax}) پر شده است`)
	}
	if (!serviceId) return
	const sk = serviceKindOf(settings, serviceId)
	if (sk !== "BOTH" && sk !== kind) throw new AppError(`این سرویس فقط برای کلاینت «${KIND_LABELS[sk]}» ارائه می‌شود`, 400, "service_kind")
}

/* ------------------------------------------------------------------ *
 * owner board — everything the settings tab renders in one round-trip
 * ------------------------------------------------------------------ */

export interface ClientTypesAdminRow extends KindAccess {
	id: string
	username: string
	/** unlimited clients this reseller already owns */
	unlimitedUsed: number
	/** true while no explicit row is stored and the defaults still apply */
	inherited: boolean
}

export interface ClientTypesServiceRow {
	id: string
	name: string
	isActive: boolean
	kind: ServiceKind
}

export interface ClientTypesBoard {
	settings: ClientTypeSettings
	admins: ClientTypesAdminRow[]
	services: ClientTypesServiceRow[]
}

/** Owner-only view: defaults, every reseller with its live usage, every service. */
export async function clientTypesBoard(): Promise<ClientTypesBoard> {
	const [settings, admins, services, unlimited] = await Promise.all([
		getClientTypeSettings(),
		prisma.admin.findMany({ where: { role: { not: "OWNER" } }, select: { id: true, username: true }, orderBy: { username: "asc" } }),
		prisma.service.findMany({ select: { id: true, name: true, isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
		prisma.client.groupBy({ by: ["adminId"], where: { trafficLimit: 0n }, _count: { _all: true } }),
	])
	const used = new Map(unlimited.map((row) => [row.adminId, row._count._all]))
	return {
		settings,
		admins: admins.map((a) => {
			const row = settings.admins[a.id]
			return {
				id: a.id,
				username: a.username,
				limited: row?.limited ?? settings.defaultLimited,
				unlimited: row?.unlimited ?? settings.defaultUnlimited,
				unlimitedMax: row?.unlimitedMax ?? settings.defaultUnlimitedMax,
				limitedMaxGB: row?.limitedMaxGB ?? settings.defaultLimitedMaxGB,
				unlimitedUsed: used.get(a.id) ?? 0,
				inherited: !row,
			}
		}),
		services: services.map((s) => ({ ...s, kind: serviceKindOf(settings, s.id) })),
	}
}
