import { prisma, type Admin, type Service } from "@srpanel/db"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import type { ClientTarget } from "./clients"
import { inboundsOf, listServersFor } from "./servers"

/**
 * Services — owner-defined bundles of inbounds.
 *
 * Resellers should not have to understand inbounds: the owner creates a service
 * (e.g. "تانل") that points at a fixed set of server/inbound pairs and decides
 * which admins may use it. The admin then only picks the service when creating
 * a client and every inbound of that service is provisioned.
 */
export interface ServiceInput {
	name: string
	description?: string | null
	targets: ClientTarget[]
	/** Admins allowed to use it; empty = every admin */
	adminIds?: string[]
	isActive?: boolean
	sortOrder?: number
}

export type ServiceTarget = ClientTarget & { serverName: string; inboundLabel: string; enabled: boolean }
export type ServiceWithTargets = Service & { targetInfo: ServiceTarget[] }

type AccessRow = { serverId: string; inboundIds: number[] }

/** Json column -> typed list (silently drops malformed rows). */
export function serviceTargets(service: Pick<Service, "targets">): ClientTarget[] {
	const raw = Array.isArray(service.targets) ? (service.targets as unknown[]) : []
	return raw
		.map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : null))
		.filter((t): t is Record<string, unknown> => !!t && typeof t.serverId === "string" && Number.isFinite(Number(t.inboundId)))
		.map((t) => ({ serverId: String(t.serverId), inboundId: Number(t.inboundId) }))
}

function isOwner(actor: Pick<Admin, "role">): boolean {
	return actor.role === "OWNER"
}

async function accessOf(actor: Pick<Admin, "id" | "role">): Promise<AccessRow[] | null> {
	if (isOwner(actor)) return null
	return prisma.adminServerAccess.findMany({ where: { adminId: actor.id }, select: { serverId: true, inboundIds: true } })
}

function canUse(access: AccessRow[] | null, t: ClientTarget): boolean {
	if (!access) return true
	const row = access.find((x) => x.serverId === t.serverId)
	return !!row && (row.inboundIds.length === 0 || row.inboundIds.includes(t.inboundId))
}

function visibilityWhere(actor: Pick<Admin, "id" | "role">, activeOnly?: boolean) {
	if (isOwner(actor)) return activeOnly ? { isActive: true } : {}
	return { isActive: true, OR: [{ adminIds: { isEmpty: true } }, { adminIds: { has: actor.id } }] }
}

/**
 * Services the actor may see. For an admin the target list is narrowed to the
 * inbounds they actually have access to, and services with nothing left are hidden.
 */
export async function listServices(actor: Pick<Admin, "id" | "role">, opts: { activeOnly?: boolean } = {}): Promise<ServiceWithTargets[]> {
	const [items, servers, access] = await Promise.all([
		prisma.service.findMany({ where: visibilityWhere(actor, opts.activeOnly), orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
		prisma.server.findMany({ where: { isActive: true } }),
		accessOf(actor),
	])
	const out: ServiceWithTargets[] = []
	for (const service of items) {
		const targetInfo: ServiceTarget[] = []
		for (const t of serviceTargets(service)) {
			if (!canUse(access, t)) continue
			const server = servers.find((s) => s.id === t.serverId)
			const inbound = server ? inboundsOf(server).find((i) => i.id === t.inboundId) : undefined
			targetInfo.push({
				...t,
				serverName: server?.name ?? "—",
				inboundLabel: inbound ? `${inbound.protocol}:${inbound.port}${inbound.remark ? ` • ${inbound.remark}` : ""}` : `#${t.inboundId}`,
				enabled: !!server && !!inbound && inbound.enable !== false,
			})
		}
		if (!isOwner(actor) && !targetInfo.length) continue
		out.push({ ...service, targetInfo })
	}
	return out
}

export async function getServiceForActor(actor: Pick<Admin, "id" | "role">, id: string): Promise<Service> {
	const service = await prisma.service.findUnique({ where: { id } })
	if (!service) throw new NotFoundError("سرویس پیدا نشد")
	if (!isOwner(actor)) {
		if (!service.isActive) throw new AppError("این سرویس فعال نیست")
		if (service.adminIds.length && !service.adminIds.includes(actor.id)) throw new ForbiddenError("به این سرویس دسترسی ندارید")
	}
	return service
}

/** Targets a client should be provisioned on, narrowed to what the actor may use. */
export async function resolveServiceTargets(actor: Pick<Admin, "id" | "role">, serviceId: string): Promise<ClientTarget[]> {
	const service = await getServiceForActor(actor, serviceId)
	const access = await accessOf(actor)
	const targets = serviceTargets(service).filter((t) => canUse(access, t))
	if (!targets.length) throw new AppError(`هیچ اینباند در دسترسی برای سرویس «${service.name}» پیدا نشد`)
	return targets
}

async function validateTargets(actor: Pick<Admin, "id" | "role">, targets: ClientTarget[]): Promise<ClientTarget[]> {
	if (!targets.length) throw new AppError("حداقل یک اینباند برای سرویس انتخاب کنید")
	const servers = await listServersFor(actor)
	const out: ClientTarget[] = []
	for (const t of targets) {
		const server = servers.find((x) => x.id === t.serverId)
		if (!server) throw new AppError("یکی از سرورهای انتخاب‌شده در دسترس نیست")
		if (!inboundsOf(server).some((i) => i.id === t.inboundId)) throw new AppError(`اینباند ${t.inboundId} روی سرور ${server.name} یافت نشد`)
		if (!out.some((x) => x.serverId === t.serverId && x.inboundId === t.inboundId)) out.push({ serverId: t.serverId, inboundId: t.inboundId })
	}
	return out
}

function normalize(input: ServiceInput) {
	const name = input.name.trim()
	if (!name) throw new AppError("نام سرویس لازم است")
	return {
		name,
		description: input.description?.trim() || null,
		adminIds: [...new Set((input.adminIds ?? []).map((x) => x.trim()).filter(Boolean))],
		isActive: input.isActive ?? true,
		sortOrder: Math.round(input.sortOrder ?? 0),
	}
}

export async function createService(actor: Admin, input: ServiceInput): Promise<Service> {
	if (!isOwner(actor)) throw new ForbiddenError("فقط مالک می‌تواند سرویس بسازد")
	const targets = await validateTargets(actor, input.targets)
	const service = await prisma.service.create({ data: { ownerId: actor.id, ...normalize(input), targets: targets as unknown as object } })
	await audit(actor.id, "service.create", service.id, { name: service.name, targets: targets.length })
	return service
}

export async function updateService(actor: Admin, id: string, input: Partial<ServiceInput>): Promise<Service> {
	if (!isOwner(actor)) throw new ForbiddenError("فقط مالک می‌تواند سرویس را تغییر دهد")
	const current = await prisma.service.findUnique({ where: { id } })
	if (!current) throw new NotFoundError("سرویس پیدا نشد")
	const merged: ServiceInput = {
		name: input.name ?? current.name,
		description: input.description === undefined ? current.description : input.description,
		targets: input.targets ?? serviceTargets(current),
		adminIds: input.adminIds ?? current.adminIds,
		isActive: input.isActive ?? current.isActive,
		sortOrder: input.sortOrder ?? current.sortOrder,
	}
	const targets = input.targets ? await validateTargets(actor, merged.targets) : serviceTargets(current)
	const service = await prisma.service.update({ where: { id: current.id }, data: { ...normalize(merged), targets: targets as unknown as object } })
	await audit(actor.id, "service.update", service.id, { fields: Object.keys(input) })
	return service
}

export async function deleteService(actor: Admin, id: string): Promise<void> {
	if (!isOwner(actor)) throw new ForbiddenError("فقط مالک می‌تواند سرویس را حذف کند")
	const current = await prisma.service.findUnique({ where: { id } })
	if (!current) throw new NotFoundError("سرویس پیدا نشد")
	await prisma.service.delete({ where: { id: current.id } })
	await audit(actor.id, "service.delete", current.id, { name: current.name })
}
