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
	const reason = new URL(req.url).searchParams.get("reason") === "idle" ? "idle" : "out"
	const res = NextResponse.redirect(new URL(`/login?reason=${reason}`, req.url), 303)
	res.cookies.delete(SESSION_COOKIE)
	res.cookies.delete(IDLE_COOKIE)
	return res
}
