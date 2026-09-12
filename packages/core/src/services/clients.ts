import { randomUUID } from "node:crypto"
import { prisma, type Admin, type Client, type Server } from "@srpanel/db"
import type { InboundProtocol, ProvisionClientInput } from "../panels/types"
import { randomToken } from "../security/token"
import { resolveFlow } from "../subscription/links"
import { bytesToGb, daysFromNow, gbToBytes } from "../util/bytes"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { configLabel, remoteSubId, sanitizeConfigName } from "../util/naming"
import { audit } from "./audit"
import { clearPendingStart, getPendingStart, pendingExpiryMs, setPendingStart, withPendingNote } from "./pendingStart"
import { adapterFor, inboundsOf, recomputeClient } from "./servers"
import { resolveServiceTargets } from "./services"
import { assertAffordable, chargeWallet, quoteClientCost } from "./wallet"

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

const clientInclude = {
	servers: { include: { server: { select: { id: true, name: true, status: true } } } },
} as const

/** Panels answer "already in use" / "duplicate" when an email or subId is taken. */
const COLLISION = /(in use|already|exists?|duplicate|تکرار|موجود)/i
const PANEL_ATTEMPTS = 4
const DAY_MS = 86_400_000

/** One remote client: every inbound of a server that shares the same panel config. */
interface PanelGroup {
	server: Server
	protocol: InboundProtocol
	flow: string
	inboundIds: number[]
}

/** An already-provisioned remote client, i.e. the stored links that share one email. */
interface LinkGroup {
	serverId: string
	remoteEmail: string
	inboundIds: number[]
	linkIds: string[]
}

export function isOwner(actor: Pick<Admin, "role">): boolean {
	return actor.role === "OWNER"
}

export function clientScope(actor: Pick<Admin, "id" | "role">) {
	return isOwner(actor) ? {} : { adminId: actor.id }
}

export async function getClientForActor(actor: Pick<Admin, "id" | "role">, id: string): Promise<ClientWithServers> {
	const client = await prisma.client.findFirst({ where: { id, ...clientScope(actor) }, include: clientInclude })
	if (!client) throw new NotFoundError("کلاینت پیدا نشد")
	return client as ClientWithServers
}

export function subscriptionUrl(client: Pick<Client, "subToken">, publicUrl = process.env.SRP_PUBLIC_URL || ""): string {
	return `${publicUrl.replace(/\/+$/, "")}/sub/${client.subToken}`
}

/** Drops duplicates/garbage and orders the list so the email suffixes stay stable. */
function normalizeTargets(list: ClientTarget[]): ClientTarget[] {
	const out: ClientTarget[] = []
	for (const t of list) {
		const serverId = String(t?.serverId ?? "")
		const inboundId = Number(t?.inboundId)
		if (!serverId || !Number.isFinite(inboundId)) continue
		if (!out.some((x) => x.serverId === serverId && x.inboundId === inboundId)) out.push({ serverId, inboundId })
	}
	return out.sort((a, b) => (a.serverId === b.serverId ? a.inboundId - b.inboundId : a.serverId < b.serverId ? -1 : 1))
}

/**
 * Turns the picked inbounds into remote clients.
 *
 * 3X-UI attaches a single client to many inbounds (that is what its own client editor
 * does), so one config is created per server - not per inbound. The client row itself
 * is protocol- and flow-shaped though, so inbounds needing a different shape (a VLESS
 * vision inbound next to a plain one) still become a second config on that panel.
 */
function groupTargets(targets: ClientTarget[], servers: Server[], uuid: string): PanelGroup[] {
	const groups = new Map<string, PanelGroup>()
	for (const t of targets) {
		const server = servers.find((s) => s.id === t.serverId)
		if (!server) continue
		const inbound = inboundsOf(server).find((i) => i.id === t.inboundId)
		const protocol = inbound?.protocol ?? "vless"
		const flow = inbound ? resolveFlow(inbound, uuid) : ""
		const key = `${server.id}|${protocol}|${flow}`
		const group = groups.get(key)
		if (group) group.inboundIds.push(t.inboundId)
		else groups.set(key, { server, protocol, flow, inboundIds: [t.inboundId] })
	}
	const out = [...groups.values()]
	for (const group of out) group.inboundIds.sort((a, b) => a - b)
	return out
}

/** Groups stored links by the identity the panel uses: one email per server = one client. */
function groupLinks(links: ClientWithServers["servers"]): LinkGroup[] {
	const groups = new Map<string, LinkGroup>()
	for (const link of [...links].sort((a, b) => a.inboundId - b.inboundId)) {
		const key = `${link.serverId}|${link.remoteEmail}`
		const group = groups.get(key)
		if (group) {
			group.inboundIds.push(link.inboundId)
			group.linkIds.push(link.id)
		} else {
			groups.set(key, { serverId: link.serverId, remoteEmail: link.remoteEmail, inboundIds: [link.inboundId], linkIds: [link.id] })
		}
	}
	return [...groups.values()]
}

/**
 * `expiryMsOverride` carries the delayed-start value: 3x-ui counts a negative
 * expiryTime from the client's first connection instead of from now.
 */
function provisionInput(client: Client, remoteEmail: string, flow: string, subId: string, expiryMsOverride?: number): ProvisionClientInput {
	return {
		uuid: client.uuid,
		email: remoteEmail,
		totalBytes: Number(client.trafficLimit),
		expiryTimeMs: expiryMsOverride !== undefined ? expiryMsOverride : client.expiresAt ? client.expiresAt.getTime() : 0,
		limitIp: client.ipLimit,
		enable: client.status !== "DISABLED",
		subId,
		flow,
		tgId: client.telegramId ?? "",
	}
}

/**
 * Creates one remote client for a whole group of inbounds.
 *
 * 3x-ui rejects a client whose subId or email is already taken; the subId is derived
 * from the group, but two customers may well carry the same name, so on a collision we
 * retry with a fresh salt / a numeric suffix instead of leaving the group unprovisioned.
 */
async function addToPanel(group: PanelGroup, client: Client, baseEmail: string, expiryMsOverride?: number): Promise<string> {
	const { server, protocol, flow, inboundIds } = group
	let email = baseEmail
	let last: unknown
	for (let attempt = 0; attempt < PANEL_ATTEMPTS; attempt++) {
		const subId = remoteSubId(client.subToken, server.id, inboundIds[0]!, attempt ? `r${attempt}` : "")
		try {
			await adapterFor(server).addClient(inboundIds, protocol, provisionInput(client, email, flow, subId, expiryMsOverride))
			return email
		} catch (err) {
			last = err
			const message = err instanceof Error ? err.message : String(err)
			if (!COLLISION.test(message)) throw err
			if (/sub\s*id/i.test(message)) continue
			if (/e-?mail/i.test(message)) {
				email = `${baseEmail}-${attempt + 2}`
				continue
			}
			throw err
		}
	}
	throw last instanceof Error ? last : new AppError(`ساخت کانفیگ روی ${server.name} ناموفق بود`)
}

/** The email never changes on update, but the derived subId may still hit another client. */
async function updateOnPanel(server: Server, group: LinkGroup, client: Client, protocol: InboundProtocol, flow: string, expiryMsOverride?: number): Promise<void> {
	let last: unknown
	for (let attempt = 0; attempt < PANEL_ATTEMPTS; attempt++) {
		const subId = remoteSubId(client.subToken, server.id, group.inboundIds[0]!, attempt ? `r${attempt}` : "")
		try {
			await adapterFor(server).updateClient(group.inboundIds, protocol, provisionInput(client, group.remoteEmail, flow, subId, expiryMsOverride))
			return
		} catch (err) {
			last = err
			const message = err instanceof Error ? err.message : String(err)
			if (COLLISION.test(message) && /sub\s*id/i.test(message)) continue
			throw err
		}
	}
	throw last instanceof Error ? last : new AppError(`به‌روزرسانی کانفیگ روی ${server.name} ناموفق بود`)
}

async function assertQuota(admin: Admin, extraBytes: bigint, targets: ClientTarget[], excludeClientId?: string): Promise<void> {
	if (isOwner(admin)) return
	if (admin.expiresAt && admin.expiresAt.getTime() < Date.now()) throw new ForbiddenError("اعتبار حساب شما به پایان رسیده است")
	if (admin.clientLimit !== null && !excludeClientId) {
		const count = await prisma.client.count({ where: { adminId: admin.id } })
		if (count >= admin.clientLimit) throw new ForbiddenError(`سقف تعداد کلاینت (${admin.clientLimit}) پر شده است`)
	}
	if (admin.trafficQuota !== null) {
		if (extraBytes === 0n) throw new ForbiddenError("با سهمیه محدود نمی‌توانید کلاینت نامحدود بسازید")
		const agg = await prisma.client.aggregate({
			where: { adminId: admin.id, ...(excludeClientId ? { id: { not: excludeClientId } } : {}) },
			_sum: { trafficLimit: true },
		})
		const allocated = agg._sum.trafficLimit ?? 0n
		if (allocated + extraBytes > admin.trafficQuota) throw new ForbiddenError("سهمیه ترافیک شما کافی نیست")
	}
	if (targets.length) {
		const access = await prisma.adminServerAccess.findMany({ where: { adminId: admin.id } })
		for (const t of targets) {
			const a = access.find((x) => x.serverId === t.serverId)
			if (!a || (a.inboundIds.length && !a.inboundIds.includes(t.inboundId))) throw new ForbiddenError("به این سرور/اینباند دسترسی ندارید")
		}
	}
}

export async function createClient(actor: Admin, input: CreateClientInput): Promise<{ client: ClientWithServers; errors: string[] }> {
	if (!input.name.trim()) throw new AppError("نام کلاینت لازم است")
	const name = sanitizeConfigName(input.name)
	const tag = sanitizeConfigName(input.tag, "") || null
	const targets = input.serviceId ? await resolveServiceTargets(actor, input.serviceId) : normalizeTargets(input.targets ?? [])
	if (!targets.length) throw new AppError("یک سرویس یا دست‌کم یک اینباند انتخاب کنید")
	const limitBytes = BigInt(gbToBytes(Math.max(0, input.trafficGB)))
	await assertQuota(actor, limitBytes, targets)
	const cost = await quoteClientCost(actor, input.trafficGB, input.days)
	await assertAffordable(actor, cost)
	const serverIds = [...new Set(targets.map((t) => t.serverId))]
	const servers = await prisma.server.findMany({ where: { id: { in: serverIds }, isActive: true } })
	if (servers.length !== serverIds.length) throw new AppError("یکی از سرورها در دسترس نیست")
	// delayed start: keep expiresAt empty, the panel counts the days from the first connection
	const delayedDays = input.startAfterUse && input.days > 0 ? Math.min(3650, Math.floor(input.days)) : 0

	const client = await prisma.client.create({
		data: {
			adminId: actor.id,
			name,
			tag,
			serviceId: input.serviceId || null,
			uuid: randomUUID(),
			subToken: randomToken(18),
			trafficLimit: limitBytes,
			expiresAt: delayedDays > 0 ? null : input.days > 0 ? daysFromNow(input.days) : null,
			ipLimit: Math.max(0, input.ipLimit ?? 0),
			note: delayedDays > 0 ? withPendingNote(input.note, delayedDays) : input.note?.trim() || null,
			telegramId: input.telegramId?.trim() || null,
			phone: input.phone?.trim() || null,
		},
	})
	if (delayedDays > 0) await setPendingStart(client.id, delayedDays)
	if (cost > 0n) await chargeWallet(actor, -cost, "PURCHASE", { refType: "client", refId: client.id, note: `ساخت کلاینت ${name}` })

	// the name the operator typed (with the tag in front) is what the panel shows
	const label = configLabel(client)
	const panelExpiryMs = delayedDays > 0 ? -(delayedDays * DAY_MS) : undefined
	const groups = groupTargets(targets, servers, client.uuid)
	const perServer = new Map<string, number>()
	const errors: string[] = []
	for (const group of groups) {
		const seen = perServer.get(group.server.id) ?? 0
		perServer.set(group.server.id, seen + 1)
		// one panel cannot hold the same email twice, so a second config on the same
		// server (a different protocol/flow) gets -2, -3, …
		const baseEmail = seen === 0 ? label : `${label}-${seen + 1}`
		const linkIds: string[] = []
		for (const inboundId of group.inboundIds) {
			const link = await prisma.clientServer.create({
				data: { clientId: client.id, serverId: group.server.id, inboundId, remoteEmail: baseEmail },
			})
			linkIds.push(link.id)
		}
		try {
			const remoteEmail = await addToPanel(group, client, baseEmail, panelExpiryMs)
			if (remoteEmail !== baseEmail) await prisma.clientServer.updateMany({ where: { id: { in: linkIds } }, data: { remoteEmail } })
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			errors.push(`${group.server.name}: ${message}`)
			await prisma.clientServer.updateMany({ where: { id: { in: linkIds } }, data: { lastError: message.slice(0, 300) } })
		}
	}
	await audit(actor.id, "client.create", client.id, {
		name,
		tag,
		serviceId: input.serviceId ?? null,
		targets: targets.length,
		configs: groups.length,
		startAfterUse: delayedDays || null,
		errors: errors.length,
	})
	return { client: await getClientForActor(actor, client.id), errors }
}

/**
 * Pushes the current DB state of a client to every panel it lives on.
 *
 * Links that share an email are one remote client attached to several inbounds, so they
 * are updated in a single call - a partial inbound list would detach it from the rest.
 * The remote email is kept as created: renaming it on the panel would detach the
 * traffic counters that 3x-ui keys by email.
 */
export async function pushClient(client: ClientWithServers): Promise<string[]> {
	const errors: string[] = []
	// a client whose period has not started yet keeps its negative panel expiry
	const pending = pendingExpiryMs(await getPendingStart(client.id))
	const expiryMsOverride = pending === null ? undefined : pending
	const servers = await prisma.server.findMany({ where: { id: { in: [...new Set(client.servers.map((s) => s.serverId))] } } })
	for (const group of groupLinks(client.servers)) {
		const server = servers.find((s) => s.id === group.serverId)
		if (!server) continue
		const inbound = inboundsOf(server).find((i) => i.id === group.inboundIds[0])
		try {
			const flow = inbound ? resolveFlow(inbound, client.uuid) : ""
			await updateOnPanel(server, group, client, inbound?.protocol ?? "vless", flow, expiryMsOverride)
			await prisma.clientServer.updateMany({ where: { id: { in: group.linkIds } }, data: { lastError: null } })
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			errors.push(`${server.name}: ${message}`)
			await prisma.clientServer.updateMany({ where: { id: { in: group.linkIds } }, data: { lastError: message.slice(0, 300) } })
		}
	}
	return errors
}

export async function updateClient(actor: Admin, id: string, input: UpdateClientInput): Promise<{ client: ClientWithServers; errors: string[] }> {
	const current = await getClientForActor(actor, id)
	const data: Record<string, unknown> = {}
	if (input.name !== undefined) {
		if (!input.name.trim()) throw new AppError("نام کلاینت لازم است")
		data.name = sanitizeConfigName(input.name)
	}
	if (input.tag !== undefined) data.tag = sanitizeConfigName(input.tag, "") || null
	if (input.trafficGB !== undefined) {
		const bytes = BigInt(gbToBytes(Math.max(0, input.trafficGB)))
		await assertQuota(actor, bytes, [], current.id)
		data.trafficLimit = bytes
	}
	if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
	if (input.addDays) {
		const base = current.expiresAt && current.expiresAt.getTime() > Date.now() ? current.expiresAt.getTime() : Date.now()
		data.expiresAt = new Date(base + input.addDays * DAY_MS)
	}
	// an explicit date wins over a not-yet-started period
	if (input.expiresAt !== undefined || input.addDays) await clearPendingStart(current.id)
	if (input.ipLimit !== undefined) data.ipLimit = Math.max(0, input.ipLimit)
	if (input.note !== undefined) data.note = input.note?.trim() || null
	if (input.telegramId !== undefined) data.telegramId = input.telegramId?.trim() || null
	if (input.phone !== undefined) data.phone = input.phone?.trim() || null
	if (input.enabled !== undefined) data.status = input.enabled ? "ACTIVE" : "DISABLED"
	// wallet billing for extra traffic / extra days (resellers only)
	let deltaCost = 0n
	if (actor.role !== "OWNER") {
		const extraGB = input.trafficGB !== undefined ? Math.max(0, input.trafficGB - bytesToGb(current.trafficLimit)) : 0
		const extraDays = input.addDays ? Math.max(0, input.addDays) : 0
		if (extraGB > 0 || extraDays > 0) {
			deltaCost = await quoteClientCost(actor, extraGB, extraDays)
			await assertAffordable(actor, deltaCost)
		}
	}
	await prisma.client.update({ where: { id: current.id }, data })
	if (deltaCost > 0n) await chargeWallet(actor, -deltaCost, "PURCHASE", { refType: "client", refId: current.id, note: `تمدید/افزایش ${current.name}` })
	await recomputeClient(current.id)
	const client = await getClientForActor(actor, id)
	const errors = await pushClient(client)
	await audit(actor.id, "client.update", client.id, { fields: Object.keys(data), errors: errors.length })
	return { client, errors }
}

export async function resetClientTraffic(actor: Admin, id: string): Promise<string[]> {
	const client = await getClientForActor(actor, id)
	const servers = await prisma.server.findMany({ where: { id: { in: [...new Set(client.servers.map((s) => s.serverId))] } } })
	const errors: string[] = []
	for (const group of groupLinks(client.servers)) {
		const server = servers.find((s) => s.id === group.serverId)
		if (!server) continue
		try {
			await adapterFor(server).resetClientTraffic(group.inboundIds[0]!, group.remoteEmail)
			await prisma.clientServer.updateMany({ where: { id: { in: group.linkIds } }, data: { up: 0n, down: 0n, lastError: null } })
		} catch (err) {
			errors.push(`${server.name}: ${err instanceof Error ? err.message : String(err)}`)
		}
	}
	await recomputeClient(client.id)
	if (client.status === "LIMITED") await pushClient(await getClientForActor(actor, id))
	await audit(actor.id, "client.reset_traffic", client.id)
	return errors
}

export async function deleteClient(actor: Admin, id: string): Promise<string[]> {
	const client = await getClientForActor(actor, id)
	const servers = await prisma.server.findMany({ where: { id: { in: [...new Set(client.servers.map((s) => s.serverId))] } } })
	const errors: string[] = []
	for (const group of groupLinks(client.servers)) {
		const server = servers.find((s) => s.id === group.serverId)
		if (!server) continue
		const inbound = inboundsOf(server).find((i) => i.id === group.inboundIds[0])
		try {
			await adapterFor(server).deleteClient(group.inboundIds, inbound?.protocol ?? "vless", { uuid: client.uuid, email: group.remoteEmail })
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			if (!/not found|پیدا نشد/i.test(message)) errors.push(`${server.name}: ${message}`)
		}
	}
	await prisma.client.delete({ where: { id: client.id } })
	await clearPendingStart(client.id)
	await audit(actor.id, "client.delete", client.id, { name: client.name, errors: errors.length })
	return errors
}

export async function listClients(actor: Admin, opts: { q?: string; status?: string; take?: number; skip?: number } = {}) {
	const where: Record<string, unknown> = { ...clientScope(actor) }
	if (opts.status && opts.status !== "ALL") where.status = opts.status
	if (opts.q) where.OR = [{ name: { contains: opts.q, mode: "insensitive" } }, { tag: { contains: opts.q, mode: "insensitive" } }, { note: { contains: opts.q, mode: "insensitive" } }, { phone: { contains: opts.q } }, { telegramId: { contains: opts.q } }]
	const [items, total] = await Promise.all([
		prisma.client.findMany({ where, include: clientInclude, orderBy: { createdAt: "desc" }, take: Math.min(opts.take ?? 100, 500), skip: opts.skip ?? 0 }),
		prisma.client.count({ where }),
	])
	return { items: items as ClientWithServers[], total }
}
