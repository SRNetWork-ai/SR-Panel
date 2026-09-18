import { randomUUID } from "node:crypto"
import { prisma, type Admin } from "@srpanel/db"
import { randomToken } from "../../security/token"
import { bytesToGb, daysFromNow, gbToBytes } from "../../util/bytes"
import { AppError } from "../../util/errors"
import { configLabel, sanitizeConfigName } from "../../util/naming"
import { audit } from "../audit"
import { assertClientKind, kindFromGB } from "../clientTypes"
import { clearPendingStart, setPendingStart, withPendingNote } from "../pendingStart"
import { adapterFor, inboundsOf, recomputeClient } from "../servers"
import { resolveServiceTargets } from "../services"
import { assertAffordable, chargeWallet, getPricingSettings, quoteClientCost } from "../wallet"
import { assertQuota, clientScope, getClientForActor } from "./access"
import { groupLinks, groupTargets, normalizeTargets } from "./grouping"
import { addToPanel, pushClient } from "./panelSync"
import { clientInclude, DAY_MS, type ClientWithServers, type CreateClientInput, type UpdateClientInput } from "./types"

export async function createClient(actor: Admin, input: CreateClientInput): Promise<{ client: ClientWithServers; errors: string[] }> {
	if (!input.name.trim()) throw new AppError("نام کلاینت لازم است")
	const name = sanitizeConfigName(input.name)
	const tag = sanitizeConfigName(input.tag, "") || null
	const targets = input.serviceId ? await resolveServiceTargets(actor, input.serviceId) : normalizeTargets(input.targets ?? [])
	if (!targets.length) throw new AppError("یک سرویس یا دست‌کم یک اینباند انتخاب کنید")
	const trafficGB = Math.max(0, input.trafficGB)
	// «حجمی / نامحدود»: what this reseller may sell, how big, and on which service
	await assertClientKind(actor, kindFromGB(trafficGB), input.serviceId ?? null, { trafficGB })
	const limitBytes = BigInt(gbToBytes(trafficGB))
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

export async function updateClient(actor: Admin, id: string, input: UpdateClientInput): Promise<{ client: ClientWithServers; errors: string[] }> {
	const current = await getClientForActor(actor, id)
	const data: Record<string, unknown> = {}
	if (input.name !== undefined) {
		if (!input.name.trim()) throw new AppError("نام کلاینت لازم است")
		data.name = sanitizeConfigName(input.name)
	}
	if (input.tag !== undefined) data.tag = sanitizeConfigName(input.tag, "") || null
	if (input.trafficGB !== undefined) {
		const gb = Math.max(0, input.trafficGB)
		// switching a client between «حجمی» and «نامحدود» obeys the same caps as creating one
		await assertClientKind(actor, kindFromGB(gb), current.serviceId, { trafficGB: gb, excludeClientId: current.id })
		const bytes = BigInt(gbToBytes(gb))
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
			deltaCost = (await getPricingSettings()).chargeOnRenew ? await quoteClientCost(actor, extraGB, extraDays) : 0n
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
