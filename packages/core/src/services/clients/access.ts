import { prisma, type Admin, type Client } from "@srpanel/db"
import { ForbiddenError, NotFoundError } from "../../util/errors"
import { clientInclude, type ClientTarget, type ClientWithServers } from "./types"

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

/** Reseller guards: account expiry, client count, traffic quota and server/inbound access. */
export async function assertQuota(admin: Admin, extraBytes: bigint, targets: ClientTarget[], excludeClientId?: string): Promise<void> {
	if (isOwner(admin)) return
	if (admin.expiresAt && admin.expiresAt.getTime() < Date.now()) throw new ForbiddenError("اعتبار حساب شما به پایان رسیده است")
	if (admin.clientLimit !== null && !excludeClientId) {
		const count = await prisma.client.count({ where: { adminId: admin.id } })
		if (count >= admin.clientLimit) throw new ForbiddenError(`سقف تعداد کلاینت (${admin.clientLimit}) پر شده است`)
	}
	if (admin.trafficQuota !== null) {
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
