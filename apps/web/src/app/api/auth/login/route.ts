import { cookies } from "next/headers"
import { z } from "zod"
import { consumeLoginCode, ensureOwner, loginCodeRequired, loginGuardState, loginWithPassword, noteLoginLocked, revokeSession } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { IDLE_COOKIE, IDLE_MIN_COOKIE, SESSION_COOKIE, clientIp, idleCookieOptions, idleMinutesOf, sessionCookieOptions } from "@/lib/auth"

const schema = z.object({
	username: z.string().min(1).max(64),
	password: z.string().min(1).max(256),
	totp: z.string().regex(/^\d{6}$/).optional(),
	/** emailed login code, only used when that feature is enabled */
	emailCode: z.string().regex(/^\d{6}$/).optional(),
})

export const POST = route(async (req) => {
	const body = await parseBody(req, schema)
	await ensureOwner().catch(() => undefined)
	const ip = await clientIp()

	// brute-force guard: refuse before the password is even checked
	const guard = await loginGuardState(body.username, ip)
	if (guard.locked) {
		await noteLoginLocked(body.username, ip, guard)
		return ok({ ok: false, reason: "locked", retryAfterSec: guard.retryAfterSec })
	}

	const result = await loginWithPassword({
		username: body.username,
		password: body.password,
		totp: body.totp,
		ip: ip ?? undefined,
		userAgent: req.headers.get("user-agent") ?? undefined,
	})
	if (!result.ok) return ok({ ok: false, reason: result.reason })

	// the emailed code is checked after password/2FA, so a fresh session is thrown
	// away again when the code is missing or wrong and no cookie is ever issued
	if (await loginCodeRequired()) {
		if (!body.emailCode) {
			await revokeSession(result.token)
			return ok({ ok: false, reason: "email_code_required" })
		}
		if (!(await consumeLoginCode(body.username, body.emailCode))) {
			await revokeSession(result.token)
			return ok({ ok: false, reason: "email_code_invalid" })
		}
	}

	const store = await cookies()
	const minutes = idleMinutesOf(store.get(IDLE_MIN_COOKIE)?.value)
	// no maxAge: closing the browser ends the session and the panel asks for user/pass again
	store.set(SESSION_COOKIE, result.token, sessionCookieOptions())
	store.set(IDLE_COOKIE, String(Date.now()), idleCookieOptions(minutes))
	return ok({ ok: true, idleMinutes: minutes, admin: { id: result.admin.id, username: result.admin.username, role: result.admin.role } })
})
