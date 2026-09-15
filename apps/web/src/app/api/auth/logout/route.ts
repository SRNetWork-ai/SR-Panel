import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { revokeSession } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { IDLE_COOKIE, SESSION_COOKIE } from "@/lib/auth"

async function drop(): Promise<void> {
	const store = await cookies()
	const token = store.get(SESSION_COOKIE)?.value
	if (token) await revokeSession(token).catch(() => undefined)
}

export const POST = route(async () => {
	await drop()
	const store = await cookies()
	store.delete(SESSION_COOKIE)
	store.delete(IDLE_COOKIE)
	return ok({ ok: true })
})

/** Used by the middleware when the idle marker expired: revoke, then land on /login. */
export async function GET(req: Request) {
	await drop()
	const q = new URL(req.url).searchParams
	const reason = q.get("reason") === "idle" ? "idle" : "out"
	// only a same-origin path survives the round trip to the login screen
	const raw = q.get("next") ?? ""
	const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/login") ? raw : ""
	const target = `/login?reason=${reason}` + (next ? `&next=${encodeURIComponent(next)}` : "")
	const res = NextResponse.redirect(new URL(target, req.url), 303)
	res.cookies.delete(SESSION_COOKIE)
	res.cookies.delete(IDLE_COOKIE)
	return res
}
