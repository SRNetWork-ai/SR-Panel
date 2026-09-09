/**
 * Personal API keys for the public REST API (/api/v1/*).
 * Format: srp_<40 chars>. Only sha256(key) is stored; the plaintext is shown once.
 */
import { prisma, type Admin, type ApiKey } from "@srpanel/db"
import { randomToken, sha256 } from "../security/token"
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../util/errors"
import { audit } from "./audit"

export const API_SCOPES = ["read", "write"] as const
export type ApiScope = (typeof API_SCOPES)[number]

export type ApiKeyPublic = Omit<ApiKey, "keyHash">

const strip = (k: ApiKey): ApiKeyPublic => {
	const { keyHash: _h, ...rest } = k
	return rest
}

export async function listApiKeys(adminId: string): Promise<ApiKeyPublic[]> {
	const keys = await prisma.apiKey.findMany({ where: { adminId }, orderBy: { createdAt: "desc" } })
	return keys.map(strip)
}

export async function createApiKey(actor: Pick<Admin, "id">, input: { name: string; scopes?: ApiScope[]; expiresAt?: string | null }): Promise<{ key: ApiKeyPublic; plaintext: string }> {
	const count = await prisma.apiKey.count({ where: { adminId: actor.id, revokedAt: null } })
	if (count >= 20) throw new ForbiddenError("حداکثر ۲۰ کلید فعال مجاز است")
	const plaintext = `srp_${randomToken(30)}`
	const key = await prisma.apiKey.create({
		data: {
			adminId: actor.id,
			name: input.name.trim().slice(0, 60) || "API key",
			prefix: plaintext.slice(0, 12),
			keyHash: sha256(plaintext),
			scopes: input.scopes?.length ? [...new Set(input.scopes)] : ["read"],
			expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
		},
	})
	await audit(actor.id, "apikey.create", key.id, { name: key.name, scopes: key.scopes })
	return { key: strip(key), plaintext }
}

export async function revokeApiKey(actor: Pick<Admin, "id">, id: string): Promise<void> {
	const key = await prisma.apiKey.findFirst({ where: { id, adminId: actor.id } })
	if (!key) throw new NotFoundError("کلید پیدا نشد")
	await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } })
	await audit(actor.id, "apikey.revoke", id, { name: key.name })
}

/** Resolves `Authorization: Bearer srp_...` to an active admin, checking the required scope. */
export async function authenticateApiKey(authorization: string | null | undefined, scope: ApiScope = "read"): Promise<{ admin: Admin; key: ApiKeyPublic }> {
	const m = /^Bearer\s+(srp_[A-Za-z0-9_-]{20,})$/i.exec(authorization ?? "")
	if (!m) throw new UnauthorizedError("API key required")
	const key = await prisma.apiKey.findUnique({ where: { keyHash: sha256(m[1]!) }, include: { admin: true } })
	if (!key || key.revokedAt) throw new UnauthorizedError("invalid API key")
	if (key.expiresAt && key.expiresAt.getTime() < Date.now()) throw new UnauthorizedError("API key expired")
	if (!key.admin.isActive) throw new ForbiddenError("admin disabled")
	if (key.admin.expiresAt && key.admin.expiresAt.getTime() < Date.now()) throw new ForbiddenError("admin expired")
	if (scope === "write" && !key.scopes.includes("write")) throw new ForbiddenError("write scope required")
	// throttle lastUsedAt writes to once per minute
	if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
		await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)
	}
	const { admin, ...rest } = key
	return { admin, key: strip(rest) }
}
