import { NextResponse, type NextRequest } from "next/server"

/**
 * Idle enforcement.
 *
 * `srp_session` is a browser-session cookie (gone when the window closes) and `srp_idle`
 * is a rolling marker whose *cookie lifetime* is the idle window: if it expired, the
 * operator has been away too long and the session is dropped server-side by the logout
 * route. Navigations count as activity, the IdleGuard heartbeat covers long reading.
 *
 * Constants are duplicated from src/lib/auth.ts on purpose — middleware runs on the edge
 * runtime and cannot import a "server-only" module.
 */
const SESSION_COOKIE = "srp_session"
const IDLE_COOKIE = "srp_idle"
const IDLE_MIN_COOKIE = "srp_idle_min"
const DEFAULT_IDLE_MIN = 15
const MIN_IDLE_MIN = 2
const MAX_IDLE_MIN = 720

function idleMinutes(raw: string | undefined): number {
	const n = Math.round(Number(raw))
	if (!Number.isFinite(n) || n <= 0) return DEFAULT_IDLE_MIN
	return Math.min(MAX_IDLE_MIN, Math.max(MIN_IDLE_MIN, n))
}

export function middleware(req: NextRequest) {
	const session = req.cookies.get(SESSION_COOKIE)?.value
	if (!session) return NextResponse.next()

	if (!req.cookies.get(IDLE_COOKIE)) {
		const url = new URL("/api/auth/logout", req.url)
		url.searchParams.set("reason", "idle")
		return NextResponse.redirect(url)
	}

	const res = NextResponse.next()
	res.cookies.set(IDLE_COOKIE, String(Date.now()), {
		httpOnly: true,
		sameSite: "lax",
		secure: req.nextUrl.protocol === "https:",
		path: "/",
		maxAge: idleMinutes(req.cookies.get(IDLE_MIN_COOKIE)?.value) * 60,
	})
	return res
}

export const config = {
	// panel pages only: API routes, static assets, the login page and every public
	// storefront/subscription path keep working without a session.
	matcher: ["/((?!api/|_next/|favicon|login|shop|sub/|s/|assets/).*)"],
}
