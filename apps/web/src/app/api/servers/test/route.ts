import { z } from "zod"
import { decryptSecret, testConnection } from "@srpanel/core"
import { prisma } from "@srpanel/db"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

const schema = z.object({
	baseUrl: z.string().min(3).max(512),
	authMode: z.enum(["password", "token"]).optional(),
	username: z.string().max(128).optional(),
	password: z.string().max(256).optional(),
	apiToken: z.string().max(512).optional(),
	totpSecret: z.string().max(128).optional(),
	twoFactorCode: z.string().max(12).optional(),
	insecureTls: z.boolean().optional(),
	/** when editing an existing server without retyping the secrets */
	serverId: z.string().optional(),
})

export const POST = route(async (req) => {
	await requireOwner()
	const body = await parseBody(req, schema)
	const stored = body.serverId ? await prisma.server.findUnique({ where: { id: body.serverId } }) : null
	const mode = body.authMode ?? (stored?.authMode === "TOKEN" ? "token" : "password")
	const password = body.password || (stored?.passwordEnc ? decryptSecret(stored.passwordEnc) : undefined)
	const apiToken = body.apiToken || (stored?.apiTokenEnc ? decryptSecret(stored.apiTokenEnc) : undefined)
	const totpSecret = body.totpSecret || (stored?.totpSecretEnc ? decryptSecret(stored.totpSecretEnc) : undefined)
	const username = body.username || stored?.username || undefined
	if (mode === "token" && !apiToken) return ok({ ok: false, error: "توکن API پنل لازم است" })
	if (mode === "password" && (!username || !password))
		return ok({ ok: false, error: "نام کاربری و رمز عبور پنل لازم است" })
	try {
		return ok(
			await testConnection({
				baseUrl: body.baseUrl,
				authMode: mode,
				username,
				password,
				apiToken,
				totpSecret,
				twoFactorCode: body.twoFactorCode,
				insecureTls: body.insecureTls ?? stored?.insecureTls ?? false,
			}),
		)
	} catch (err) {
		return ok({ ok: false, error: err instanceof Error ? err.message : "خطای نامشخص" })
	}
})
