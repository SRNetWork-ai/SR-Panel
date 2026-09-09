import { prisma, type Admin } from "@srpanel/db"
import { hashPassword, verifyPassword } from "../security/password"
import { generateTotpSecret, otpauthUrl, verifyTotp } from "../security/totp"
import { gbToBytes } from "../util/bytes"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { revokeAllSessions } from "./auth"

export interface AdminInput {
	username: string
	password?: string
	displayName?: string | null
	isActive?: boolean
	/** GB, null = unlimited */
	trafficQuotaGB?: number | null
	clientLimit?: number | null
	/** ISO date or null = never */
	expiresAt?: string | null
	telegramId?: string | null
	/** server access: serverId -> inbound ids (empty = all inbounds) */
	serverAccess?: Array<{ serverId: string; inboundIds: number[] }>
}

const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/

function assertOwner(actor: Pick<Admin, "role">): void {
	if (actor.role !== "OWNER") throw new ForbiddenError("فقط مالک پنل مجاز است")
}

export const adminInclude = {
	serverAccess: { select: { serverId: true, inboundIds: true } },
	_count: { select: { clients: true } },
} as const

export async function listAdmins(actor: Admin) {
	assertOwner(actor)
	const admins = await prisma.admin.findMany({ include: adminInclude, orderBy: [{ role: "asc" }, { createdAt: "asc" }] })
	const usage = await prisma.client.groupBy({ by: ["adminId"], _sum: { trafficLimit: true, usedUp: true, usedDown: true } })
	return admins.map((a) => {
		const u = usage.find((x) => x.adminId === a.id)
		return {
			...a,
			allocatedBytes: u?._sum.trafficLimit ?? 0n,
			usedBytes: (u?._sum.usedUp ?? 0n) + (u?._sum.usedDown ?? 0n),
		}
	})
}

export async function createAdmin(actor: Admin, input: AdminInput): Promise<Admin> {
	assertOwner(actor)
	const username = input.username.trim().toLowerCase()
	if (!USERNAME_RE.test(username)) throw new AppError("نام کاربری باید ۳ تا ۳۲ کاراکتر لاتین باشد")
	if (!input.password || input.password.length < 8) throw new AppError("رمز عبور حداقل ۸ کاراکتر باشد")
	if (await prisma.admin.findUnique({ where: { username } })) throw new AppError("این نام کاربری قبلاً گرفته شده")
	const admin = await prisma.admin.create({
		data: {
			username,
			passwordHash: hashPassword(input.password),
			role: "ADMIN",
			displayName: input.displayName?.trim() || null,
			isActive: input.isActive ?? true,
			trafficQuota: input.trafficQuotaGB === null || input.trafficQuotaGB === undefined ? null : BigInt(gbToBytes(input.trafficQuotaGB)),
			clientLimit: input.clientLimit ?? null,
			expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
			telegramId: input.telegramId?.trim() || null,
			createdById: actor.id,
			serverAccess: input.serverAccess?.length
				? { create: input.serverAccess.map((s) => ({ serverId: s.serverId, inboundIds: s.inboundIds })) }
				: undefined,
		},
	})
	await audit(actor.id, "admin.create", admin.id, { username })
	return admin
}

export async function updateAdmin(actor: Admin, id: string, input: Partial<AdminInput>): Promise<Admin> {
	assertOwner(actor)
	const target = await prisma.admin.findUnique({ where: { id } })
	if (!target) throw new NotFoundError("ادمین پیدا نشد")
	const data: Record<string, unknown> = {}
	if (input.displayName !== undefined) data.displayName = input.displayName?.trim() || null
	if (input.telegramId !== undefined) data.telegramId = input.telegramId?.trim() || null
	if (input.password) {
		if (input.password.length < 8) throw new AppError("رمز عبور حداقل ۸ کاراکتر باشد")
		data.passwordHash = hashPassword(input.password)
	}
	if (target.role !== "OWNER") {
		if (input.isActive !== undefined) data.isActive = input.isActive
		if (input.trafficQuotaGB !== undefined) data.trafficQuota = input.trafficQuotaGB === null ? null : BigInt(gbToBytes(input.trafficQuotaGB))
		if (input.clientLimit !== undefined) data.clientLimit = input.clientLimit
		if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
	}
	const admin = await prisma.$transaction(async (tx) => {
		if (input.serverAccess && target.role !== "OWNER") {
			await tx.adminServerAccess.deleteMany({ where: { adminId: id } })
			if (input.serverAccess.length)
				await tx.adminServerAccess.createMany({ data: input.serverAccess.map((s) => ({ adminId: id, serverId: s.serverId, inboundIds: s.inboundIds })) })
		}
		return tx.admin.update({ where: { id }, data })
	})
	if (input.isActive === false || input.password) await revokeAllSessions(id)
	await audit(actor.id, "admin.update", id, { fields: Object.keys(data), serverAccess: input.serverAccess?.length })
	return admin
}

export async function deleteAdmin(actor: Admin, id: string): Promise<void> {
	assertOwner(actor)
	const target = await prisma.admin.findUnique({ where: { id }, include: { _count: { select: { clients: true } } } })
	if (!target) throw new NotFoundError("ادمین پیدا نشد")
	if (target.role === "OWNER") throw new ForbiddenError("مالک پنل قابل حذف نیست")
	if (target._count.clients > 0) throw new AppError("اول کلاینت‌های این ادمین را حذف یا منتقل کنید")
	await prisma.admin.delete({ where: { id } })
	await audit(actor.id, "admin.delete", id, { username: target.username })
}

/* ---------- self-service (any admin) ---------- */

export async function changeOwnPassword(actor: Admin, current: string, next: string): Promise<void> {
	if (!verifyPassword(current, actor.passwordHash)) throw new AppError("رمز فعلی نادرست است")
	if (next.length < 8) throw new AppError("رمز جدید حداقل ۸ کاراکتر باشد")
	await prisma.admin.update({ where: { id: actor.id }, data: { passwordHash: hashPassword(next) } })
	await audit(actor.id, "auth.password_changed", actor.id)
}

/** Step 1: create a pending secret (stored but not enabled) and return the otpauth URL for the QR code. */
export async function beginTotpSetup(actor: Admin, issuer = process.env.SRP_BRAND_NAME || "SRPanel") {
	const secret = generateTotpSecret()
	await prisma.admin.update({ where: { id: actor.id }, data: { totpSecret: secret, totpEnabled: false } })
	return { secret, url: otpauthUrl(issuer, actor.username, secret) }
}

/** Step 2: confirm with a live code. */
export async function confirmTotp(actor: Admin, code: string): Promise<void> {
	const fresh = await prisma.admin.findUnique({ where: { id: actor.id } })
	if (!fresh?.totpSecret) throw new AppError("ابتدا راه‌اندازی ۲ مرحله‌ای را شروع کنید")
	if (!verifyTotp(fresh.totpSecret, code)) throw new AppError("کد نادرست است")
	await prisma.admin.update({ where: { id: actor.id }, data: { totpEnabled: true } })
	await audit(actor.id, "auth.totp_enabled", actor.id)
}

export async function disableTotp(actor: Admin, code: string): Promise<void> {
	if (!actor.totpSecret || !verifyTotp(actor.totpSecret, code)) throw new AppError("کد نادرست است")
	await prisma.admin.update({ where: { id: actor.id }, data: { totpEnabled: false, totpSecret: null } })
	await audit(actor.id, "auth.totp_disabled", actor.id)
}
