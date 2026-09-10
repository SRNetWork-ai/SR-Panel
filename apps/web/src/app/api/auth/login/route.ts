import { cookies } from "next/headers"
import { z } from "zod"
import { SESSION_DAYS, ensureOwner, loginWithPassword } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { SESSION_COOKIE, clientIp } from "@/lib/auth"

const schema = z.object({
	username: z.string().min(1).max(64),
	password: z.string().min(1).max(256),
	totp: z.string().regex(/^\d{6}$/).optional(),
})

export const POST = route(async (req) => {
	const body = await parseBody(req, schema)
	await ensureOwner().catch(() => undefined)
	const ip = await clientIp()
	const result = await loginWithPassword({ ...body, ip: ip ?? undefined, userAgent: req.headers.get("user-agent") ?? undefined })
	if (!result.ok) return ok({ ok: false, reason: result.reason })

	const store = await cookies()
	store.set(SESSION_COOKIE, result.token, {
		httpOnly: true,
		sameSite: "lax",
		secure: (process.env.SRP_PUBLIC_URL || "").startsWith("https://"),
		path: "/",
		maxAge: SESSION_DAYS * 24 * 60 * 60,
	})
	return ok({ ok: true, admin: { id: result.admin.id, username: result.admin.username, role: result.admin.role } })
})
