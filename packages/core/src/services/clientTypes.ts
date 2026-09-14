/**
 * Client types — «حجمی» (LIMITED) and «نامحدود» (UNLIMITED).
 *
 * Who may create which type, and which service is offered for which type, is
 * owner-configurable and lives in the Setting table under the `clientTypes`
 * key — no schema change. A client counts as LIMITED when it has a traffic
 * quota and UNLIMITED when the quota is 0 (the convention the panel already
 * uses for `Client.trafficLimit`).
 */
import { type Admin } from "@srpanel/db"
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

const kindAccessSchema = z.object({
	limited: z.boolean().default(true),
	unlimited: z.boolean().default(false),
})
export type KindAccess = z.infer<typeof kindAccessSchema>

export const clientTypesSchema = z.object({
	/** applies to every reseller without an explicit row */
	defaultLimited: z.boolean().default(true),
	defaultUnlimited: z.boolean().default(false),
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
	admins?: Record<string, { limited?: boolean; unlimited?: boolean }>
	services?: Record<string, ServiceKind>
}

/** Patches the stored maps instead of replacing them. */
export async function saveClientTypes(patch: ClientTypesPatch): Promise<ClientTypeSettings> {
	const cur = await getClientTypeSettings()
	const admins: Record<string, KindAccess> = { ...cur.admins }
	for (const [id, row] of Object.entries(patch.admins ?? {})) {
		const prev = admins[id] ?? { limited: cur.defaultLimited, unlimited: cur.defaultUnlimited }
		admins[id] = { limited: row.limited ?? prev.limited, unlimited: row.unlimited ?? prev.unlimited }
	}
	return setSetting(CLIENT_TYPES_KEY, clientTypesSchema, {
		defaultLimited: patch.defaultLimited ?? cur.defaultLimited,
		defaultUnlimited: patch.defaultUnlimited ?? cur.defaultUnlimited,
		admins,
		services: { ...cur.services, ...(patch.services ?? {}) },
	})
}

/** 0 GB / 0 bytes means «unlimited» everywhere in the panel. */
export const kindFromGB = (gb: number): ClientKind => (gb > 0 ? "LIMITED" : "UNLIMITED")
export const kindFromBytes = (bytes: bigint | number): ClientKind => (BigInt(bytes) > 0n ? "LIMITED" : "UNLIMITED")

type ActorLike = Pick<Admin, "id" | "role">

/** The owner may always create both types. */
export function kindsOf(settings: ClientTypeSettings, actor: ActorLike): KindAccess {
	if (actor.role === "OWNER") return { limited: true, unlimited: true }
	const row = settings.admins[actor.id]
	return {
		limited: row?.limited ?? settings.defaultLimited,
		unlimited: row?.unlimited ?? settings.defaultUnlimited,
	}
}

export const serviceKindOf = (settings: ClientTypeSettings, serviceId: string): ServiceKind => settings.services[serviceId] ?? "BOTH"

export function serviceAllowsKind(settings: ClientTypeSettings, serviceId: string, kind: ClientKind): boolean {
	const sk = serviceKindOf(settings, serviceId)
	return sk === "BOTH" || sk === kind
}

export interface ClientTypeAccess {
	limited: boolean
	unlimited: boolean
	/** serviceId → allowed client types; missing means «both» */
	services: Record<string, ServiceKind>
}

/** Everything the clients page needs to pick which «new client» buttons to show. */
export async function clientTypeAccess(actor: ActorLike): Promise<ClientTypeAccess> {
	const settings = await getClientTypeSettings()
	const allowed = kindsOf(settings, actor)
	return { limited: allowed.limited, unlimited: allowed.unlimited, services: settings.services }
}

/** Throws when this actor may not create a client of this kind on this service. */
export async function assertClientKind(actor: ActorLike, kind: ClientKind, serviceId?: string | null): Promise<void> {
	const settings = await getClientTypeSettings()
	const allowed = kindsOf(settings, actor)
	if (kind === "LIMITED" && !allowed.limited) throw new ForbiddenError("اجازهٔ ساخت کلاینت حجمی را ندارید")
	if (kind === "UNLIMITED" && !allowed.unlimited) throw new ForbiddenError("اجازهٔ ساخت کلاینت نامحدود را ندارید")
	if (!serviceId) return
	const sk = serviceKindOf(settings, serviceId)
	if (sk !== "BOTH" && sk !== kind) throw new AppError(`این سرویس فقط برای کلاینت «${KIND_LABELS[sk]}» ارائه می‌شود`, 400, "service_kind")
}
