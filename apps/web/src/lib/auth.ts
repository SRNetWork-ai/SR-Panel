import "server-only"
import { cookies, headers } from "next/headers"
import { ForbiddenError, UnauthorizedError, getSessionAdmin } from "@srpanel/core"
import type { Admin } from "@srpanel/db"
import type { Locale } from "./format"

export const SESSION_COOKIE = "srp_session"
export const LOCALE_COOKIE = "srp_lang"
export const THEME_COOKIE = "srp_theme"
/** Rolling activity marker — its cookie lifetime *is* the idle window. */
export const IDLE_COOKIE = "srp_idle"
/** Idle window in minutes, chosen in Settings → Session (middleware reads it too). */
export const IDLE_MIN_COOKIE = "srp_idle_min"
export const DEFAULT_IDLE_MIN = 15
export const MIN_IDLE_MIN = 2
export const MAX_IDLE_MIN = 720

/** Clamps whatever is in the cookie; falls back to the default for junk values. */
export function idleMinutesOf(value: string | null | undefined): number {
	const n = Math.round(Number(value))
	if (!Number.isFinite(n) || n <= 0) return DEFAULT_IDLE_MIN
	return Math.min(MAX_IDLE_MIN, Math.max(MIN_IDLE_MIN, n))
}

export function cookieSecure(): boolean {
	return (process.env.SRP_PUBLIC_URL || "").startsWith("https://")
}

/** No maxAge on purpose: the session dies with the browser window. */
export function sessionCookieOptions() {
	return { httpOnly: true, sameSite: "lax" as const, secure: cookieSecure(), path: "/" }
}

export function idleCookieOptions(minutes: number) {
	return { ...sessionCookieOptions(), maxAge: Math.max(MIN_IDLE_MIN, minutes) * 60 }
}

export async function currentAdmin(): Promise<Admin | null> {
	const store = await cookies()
	const token = store.get(SESSION_COOKIE)?.value
	if (!token) return null
	return getSessionAdmin(token)
}

export async function requireAdmin(): Promise<Admin> {
	const admin = await currentAdmin()
	if (!admin) throw new UnauthorizedError()
	return admin
}

export async function requireOwner(): Promise<Admin> {
	const admin = await requireAdmin()
	if (admin.role !== "OWNER") throw new ForbiddenError()
	return admin
}

export async function clientIp(): Promise<string | null> {
	const h = await headers()
	return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

export async function currentLocale(): Promise<Locale> {
	const store = await cookies()
	return store.get(LOCALE_COOKIE)?.value === "en" ? "en" : "fa"
}

export async function currentTheme(): Promise<"dark" | "light"> {
	const store = await cookies()
	return store.get(THEME_COOKIE)?.value === "light" ? "light" : "dark"
}

export async function currentIdleMinutes(): Promise<number> {
	const store = await cookies()
	return idleMinutesOf(store.get(IDLE_MIN_COOKIE)?.value)
}
