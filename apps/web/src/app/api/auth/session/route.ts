import { cookies } from "next/headers"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { IDLE_COOKIE, IDLE_MIN_COOKIE, MAX_IDLE_MIN, MIN_IDLE_MIN, cookieSecure, idleCookieOptions, idleMinutesOf, requireAdmin } from "@/lib/auth"

/** Heartbeat: the operator is still there, push the idle marker forward. */
export const POST = route(async () => {
	await requireAdmin()
	const store = await cookies()
	const minutes = idleMinutesOf(store.get(IDLE_MIN_COOKIE)?.value)
	store.set(IDLE_COOKIE, String(Date.now()), idleCookieOptions(minutes))
	return ok({ ok: true, idleMinutes: minutes })
})

const schema = z.object({ minutes: z.number().int().min(MIN_IDLE_MIN).max(MAX_IDLE_MIN) })

/** Settings → Session: change the idle window for this browser. */
export const PUT = route(async (req) => {
	await requireAdmin()
	const { minutes } = await parseBody(req, schema)
	const store = await cookies()
	// readable by the client so the guard can react without a reload
	store.set(IDLE_MIN_COOKIE, String(minutes), { httpOnly: false, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: 365 * 24 * 60 * 60 })
	store.set(IDLE_COOKIE, String(Date.now()), idleCookieOptions(minutes))
	return ok({ ok: true, idleMinutes: minutes })
})

export const GET = route(async () => {
	await requireAdmin()
	const store = await cookies()
	return ok({ idleMinutes: idleMinutesOf(store.get(IDLE_MIN_COOKIE)?.value), min: MIN_IDLE_MIN, max: MAX_IDLE_MIN })
})
