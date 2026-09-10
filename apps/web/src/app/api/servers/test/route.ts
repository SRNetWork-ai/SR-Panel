import { z } from "zod"
import { decryptSecret, testConnection } from "@srpanel/core"
import { prisma } from "@srpanel/db"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

const schema = z.object({
	baseUrl: z.string().url(),
	username: z.string().min(1),
	password: z.string().optional(),
	/** when editing an existing server without retyping the password */
	serverId: z.string().optional(),
})

export const POST = route(async (req) => {
	await requireOwner()
	const body = await parseBody(req, schema)
	let password = body.password
	if (!password && body.serverId) {
		const s = await prisma.server.findUnique({ where: { id: body.serverId } })
		if (s) password = decryptSecret(s.passwordEnc)
	}
	if (!password) return ok({ ok: false, error: "رمز عبور پنل لازم است" })
	return ok(await testConnection({ baseUrl: body.baseUrl, username: body.username, password }))
})
