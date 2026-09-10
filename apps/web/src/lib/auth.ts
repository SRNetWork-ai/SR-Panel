import "server-only"
import { cookies, headers } from "next/headers"
import { ForbiddenError, UnauthorizedError, getSessionAdmin } from "@srpanel/core"
import type { Admin } from "@srpanel/db"
import type { Locale } from "./format"

export const SESSION_COOKIE = "srp_session"
export const LOCALE_COOKIE = "srp_lang"
export const THEME_COOKIE = "srp_theme"

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
