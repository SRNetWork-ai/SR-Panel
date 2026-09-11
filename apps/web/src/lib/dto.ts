/* Plain, JSON-safe shapes shared between server and client components. Only `import type` from server packages here. */
import type { Admin, Server } from "@srpanel/db"
import type { ClientWithServers } from "@srpanel/core"

export interface AdminDto {
	id: string
	username: string
	displayName: string | null
	role: "OWNER" | "ADMIN"
	isActive: boolean
	trafficQuota: number | null
	clientLimit: number | null
	expiresAt: string | null
	telegramId: string | null
	totpEnabled: boolean
	lastLoginAt: string | null
	createdAt: string
	serverAccess?: Array<{ serverId: string; inboundIds: number[] }>
	clientCount?: number
	allocatedBytes?: number
	usedBytes?: number
}

export interface InboundDto {
	id: number
	remark: string
	protocol: string
	port: number
	enable: boolean
	network: string
	security: string
}

export interface ServerDto {
	id: string
	name: string
	baseUrl: string
	username: string
	authMode: "password" | "token"
	hasApiToken: boolean
	hasTotp: boolean
	insecureTls: boolean
	panelVersion: string | null
	caps: { clientsApi: boolean; inboundOptions: boolean; bearerAuth: boolean; twoFactor: boolean } | null
	publicHost: string | null
	subBaseUrl: string | null
	weight: number
	isActive: boolean
	status: string
	lastSeenAt: string | null
	lastError: string | null
	inboundsSyncAt: string | null
	inbounds: InboundDto[]
	stats: { cpu: number | null; memPct: number | null; xrayState: string | null; xrayVersion: string | null; uptime: number | null; netUp: number; netDown: number } | null
	clientCount?: number
	createdAt: string
}

export interface ClientServerDto {
	id: string
	serverId: string
	serverName: string
	serverStatus: string
	inboundId: number
	remoteEmail: string
	up: number
	down: number
	enabled: boolean
	lastError: string | null
}

export interface ClientDto {
	id: string
	adminId: string
	name: string
	uuid: string
	subToken: string
	subUrl: string
	trafficLimit: number
	usedUp: number
	usedDown: number
	expiresAt: string | null
	ipLimit: number
	status: string
	note: string | null
	telegramId: string | null
	phone: string | null
	lastOnlineAt: string | null
	createdAt: string
	servers: ClientServerDto[]
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const num = (b: bigint | number | null | undefined) => (b === null || b === undefined ? null : Number(b))

export function toAdminDto(a: Admin & { serverAccess?: Array<{ serverId: string; inboundIds: number[] }>; _count?: { clients: number }; allocatedBytes?: bigint; usedBytes?: bigint }): AdminDto {
	return {
		id: a.id,
		username: a.username,
		displayName: a.displayName,
		role: a.role,
		isActive: a.isActive,
		trafficQuota: num(a.trafficQuota),
		clientLimit: a.clientLimit,
		expiresAt: iso(a.expiresAt),
		telegramId: a.telegramId,
		totpEnabled: a.totpEnabled,
		lastLoginAt: iso(a.lastLoginAt),
		createdAt: a.createdAt.toISOString(),
		serverAccess: a.serverAccess,
		clientCount: a._count?.clients,
		allocatedBytes: a.allocatedBytes !== undefined ? Number(a.allocatedBytes) : undefined,
		usedBytes: a.usedBytes !== undefined ? Number(a.usedBytes) : undefined,
	}
}

export function toServerDto(s: Server & { clientCount?: number }): ServerDto {
	const inbounds = Array.isArray(s.inboundsJson) ? (s.inboundsJson as any[]) : []
	const st = (s.statusJson ?? null) as Record<string, any> | null
	const memTotal = st ? Number(st.memTotal ?? 0) : 0
	return {
		id: s.id,
		name: s.name,
		baseUrl: s.baseUrl,
		username: s.username,
		authMode: s.authMode === "TOKEN" ? "token" : "password",
		hasApiToken: Boolean(s.apiTokenEnc),
		hasTotp: Boolean(s.totpSecretEnc),
		insecureTls: Boolean(s.insecureTls),
		panelVersion: s.panelVersion ?? null,
		caps: (s.capsJson ?? null) as ServerDto["caps"],
		publicHost: s.publicHost,
		subBaseUrl: s.subBaseUrl,
		weight: s.weight,
		isActive: s.isActive,
		status: s.status,
		lastSeenAt: iso(s.lastSeenAt),
		lastError: s.lastError,
		inboundsSyncAt: iso(s.inboundsSyncAt),
		inbounds: inbounds.map((i) => ({
			id: Number(i.id),
			remark: String(i.remark ?? ""),
			protocol: String(i.protocol ?? ""),
			port: Number(i.port ?? 0),
			enable: Boolean(i.enable),
			network: String(i.streamSettings?.network ?? "tcp"),
			security: String(i.streamSettings?.security ?? "none"),
		})),
		stats: st
			? {
					cpu: st.cpu !== undefined ? Number(st.cpu) : null,
					memPct: memTotal > 0 ? Math.round((Number(st.memUsed ?? 0) / memTotal) * 100) : null,
					xrayState: st.xrayState ? String(st.xrayState) : null,
					xrayVersion: st.xrayVersion ? String(st.xrayVersion) : null,
					uptime: st.uptime !== undefined ? Number(st.uptime) : null,
					netUp: Number(st.netUp ?? 0),
					netDown: Number(st.netDown ?? 0),
			  }
			: null,
		clientCount: s.clientCount,
		createdAt: s.createdAt.toISOString(),
	}
}

export function toClientDto(c: ClientWithServers, publicUrl: string): ClientDto {
	return {
		id: c.id,
		adminId: c.adminId,
		name: c.name,
		uuid: c.uuid,
		subToken: c.subToken,
		subUrl: `${publicUrl.replace(/\/+$/, "")}/sub/${c.subToken}`,
		trafficLimit: Number(c.trafficLimit),
		usedUp: Number(c.usedUp),
		usedDown: Number(c.usedDown),
		expiresAt: iso(c.expiresAt),
		ipLimit: c.ipLimit,
		status: c.status,
		note: c.note,
		telegramId: c.telegramId,
		phone: c.phone,
		lastOnlineAt: iso(c.lastOnlineAt),
		createdAt: c.createdAt.toISOString(),
		servers: c.servers.map((s) => ({
			id: s.id,
			serverId: s.serverId,
			serverName: s.server.name,
			serverStatus: s.server.status,
			inboundId: s.inboundId,
			remoteEmail: s.remoteEmail,
			up: Number(s.up),
			down: Number(s.down),
			enabled: s.enabled,
			lastError: s.lastError,
		})),
	}
}

export function publicUrl(): string {
	return (process.env.SRP_PUBLIC_URL || "").replace(/\/+$/, "")
}
