import { cookies } from "next/headers"
import { z } from "zod"
import { ensureOwner, loginWithPassword } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { IDLE_COOKIE, IDLE_MIN_COOKIE, SESSION_COOKIE, clientIp, idleCookieOptions, idleMinutesOf, sessionCookieOptions } from "@/lib/auth"

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
	const minutes = idleMinutesOf(store.get(IDLE_MIN_COOKIE)?.value)
	// no maxAge: closing the browser ends the session and the panel asks for user/pass again
	store.set(SESSION_COOKIE, result.token, sessionCookieOptions())
	store.set(IDLE_COOKIE, String(Date.now()), idleCookieOptions(minutes))
	return ok({ ok: true, idleMinutes: minutes, admin: { id: result.admin.id, username: result.admin.username, role: result.admin.role } })
})
