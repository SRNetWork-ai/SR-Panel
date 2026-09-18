import type { Client, Server } from "@srpanel/db"
import type { InboundProtocol } from "../../panels/types"

export interface ClientTarget {
	serverId: string
	inboundId: number
}

export interface CreateClientInput {
	name: string
	/** Optional prefix shown before every config name of this client */
	tag?: string | null
	/** Provision from an owner-defined service instead of hand-picking inbounds */
	serviceId?: string | null
	/** GB, 0 = unlimited */
	trafficGB: number
	/** days from now, 0 = never */
	days: number
	/**
	 * Delayed start: `days` is not counted from now but from the customer's first
	 * connection (3x-ui gets a negative expiry, the real date is written by the worker).
	 */
	startAfterUse?: boolean
	ipLimit?: number
	note?: string
	telegramId?: string
	phone?: string
	targets?: ClientTarget[]
}

export interface UpdateClientInput {
	name?: string
	tag?: string | null
	trafficGB?: number
	/** absolute ISO date or null for never */
	expiresAt?: string | null
	/** extend from max(now, current expiry) */
	addDays?: number
	ipLimit?: number
	note?: string | null
	telegramId?: string | null
	phone?: string | null
	enabled?: boolean
}

export type ClientWithServers = Client & { servers: Array<{ id: string; serverId: string; inboundId: number; remoteEmail: string; up: bigint; down: bigint; enabled: boolean; lastError: string | null; server: Pick<Server, "id" | "name" | "status"> }> }

export const clientInclude = {
	servers: { include: { server: { select: { id: true, name: true, status: true } } } },
} as const

/** Panels answer "already in use" / "duplicate" when an email or subId is taken. */
export const COLLISION = /(in use|already|exists?|duplicate|تکرار|موجود)/i
export const PANEL_ATTEMPTS = 4
export const DAY_MS = 86_400_000

/** One remote client: every inbound of a server that shares the same panel config. */
export interface PanelGroup {
	server: Server
	protocol: InboundProtocol
	flow: string
	inboundIds: number[]
}

/** An already-provisioned remote client, i.e. the stored links that share one email. */
export interface LinkGroup {
	serverId: string
	remoteEmail: string
	inboundIds: number[]
	linkIds: string[]
}
