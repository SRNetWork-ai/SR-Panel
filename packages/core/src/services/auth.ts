import { prisma, type Admin } from "@srpanel/db"
import { verifyPassword } from "../security/password"
import { randomToken, sha256 } from "../security/token"
import { verifyTotp } from "../security/totp"
import { daysFromNow } from "../util/bytes"
import { audit } from "./audit"
import { ensureOwner } from "./bootstrap"

export const SESSION_DAYS = 30

export type LoginResult =
	| { ok: true; token: string; admin: Admin }
	| { ok: false; reason: "invalid" | "disabled" | "totp_required" | "totp_invalid" }

export async function loginWithPassword(p: {
	username: string
	password: string
	totp?: string
	ip?: string | null
	userAgent?: string | null
}): Promise<LoginResult> {
	await ensureOwner()
	const username = p.username.trim().toLowerCase()
	const admin = await prisma.admin.findUnique({ where: { username } })
	if (!admin || !verifyPassword(p.password, admin.passwordHash)) {
		await audit(null, "auth.login_failed", username, undefined, p.ip)
		return { ok: false, reason: "invalid" }
	}
	if (!admin.isActive || (admin.expiresAt && admin.expiresAt.getTime() < Date.now())) return { ok: false, reason: "disabled" }
	if (admin.totpEnabled && admin.totpSecret) {
		if (!p.totp) return { ok: false, reason: "totp_required" }
		if (!verifyTotp(admin.totpSecret, p.totp)) return { ok: false, reason: "totp_invalid" }
	}
	const token = randomToken(32)
	await prisma.session.create({
		data: {
			adminId: admin.id,
			tokenHash: sha256(token),
			ip: p.ip ?? null,
			userAgent: p.userAgent?.slice(0, 300) ?? null,
			expiresAt: daysFromNow(SESSION_DAYS),
		},
	})
	await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date(), lastLoginIp: p.ip ?? null } })
	await audit(admin.id, "auth.login", username, undefined, p.ip)
	return { ok: true, token, admin }
}

export async function getSessionAdmin(token: string): Promise<Admin | null> {
	if (!token) return null
	const session = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { admin: true } })
	if (!session || session.expiresAt.getTime() < Date.now() || !session.admin.isActive) return null
	return session.admin
}

export async function revokeSession(token: string): Promise<void> {
	await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } })
}

export async function revokeAllSessions(adminId: string): Promise<void> {
	await prisma.session.deleteMany({ where: { adminId } })
}
