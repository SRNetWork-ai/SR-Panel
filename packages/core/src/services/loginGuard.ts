/**
 * Login brute-force guard — no schema change.
 *
 * Failed attempts are counted straight from the AuditLog rows that `loginWithPassword`
 * already writes (`auth.login_failed`); a successful `auth.login` inside the window clears
 * the streak. The policy itself lives in the Setting table under the `security` key.
 */
import { Prisma, prisma } from "@srpanel/db"
import { z } from "zod"
import { sha256 } from "../security/token"
import { audit } from "./audit"
import { notify } from "./notifications"
import { brandName, getSetting, setSetting } from "./settings"
import { tgEscape } from "./telegram"

export const SECURITY_SETTINGS_KEY = "security"

export const securitySettingsSchema = z.object({
	/** temporarily refuse logins after too many failures */
	lockEnabled: z.boolean().default(true),
	/** failed attempts inside the window before the lock starts */
	maxFailures: z.number().int().min(3).max(50).default(8),
	/** how far back failures are counted (minutes) */
	windowMin: z.number().int().min(1).max(1440).default(15),
	/** how long the lock lasts, counted from the last failure (minutes) */
	lockMin: z.number().int().min(1).max(1440).default(15),
	/** lock the source IP as well, not only the username */
	perIp: z.boolean().default(true),
	/** owner-only Telegram alert when a lock starts */
	notifyLock: z.boolean().default(true),
	/** sign every other browser out when an admin changes his own password */
	revokeOnPasswordChange: z.boolean().default(true),
})
export type SecuritySettings = z.infer<typeof securitySettingsSchema>

export const getSecuritySettings = () => getSetting(SECURITY_SETTINGS_KEY, securitySettingsSchema)
export const saveSecuritySettings = (input: unknown) => setSetting(SECURITY_SETTINGS_KEY, securitySettingsSchema, input)

export type LoginGuardScope = "user" | "ip"
export type LoginGuardState = {
	locked: boolean
	/** seconds left before the next attempt is accepted */
	retryAfterSec: number
	failures: number
	maxFailures: number
	scope: LoginGuardScope | null
}

type Attempt = { action: string; target: string | null; ip: string | null; at: Date }

const normUser = (v: string) => v.trim().toLowerCase().slice(0, 64)

/** Failures newer than the latest successful login of the same scope. */
function streak(rows: Attempt[]): { failures: number; lastAt: number } {
	let failures = 0
	let lastAt = 0
	for (const r of rows) {
		if (r.action !== "auth.login_failed") break
		if (failures === 0) lastAt = r.at.getTime()
		failures += 1
	}
	return { failures, lastAt }
}

/** Read-only check: is this username / IP currently locked out? */
export async function loginGuardState(usernameRaw: string, ip?: string | null): Promise<LoginGuardState> {
	const s = await getSecuritySettings()
	const idle: LoginGuardState = { locked: false, retryAfterSec: 0, failures: 0, maxFailures: s.maxFailures, scope: null }
	if (!s.lockEnabled) return idle
	const username = normUser(usernameRaw)
	const or: Prisma.AuditLogWhereInput[] = [{ target: username }]
	if (s.perIp && ip) or.push({ ip })
	const rows = await prisma.auditLog.findMany({
		where: { action: { in: ["auth.login_failed", "auth.login"] }, at: { gte: new Date(Date.now() - s.windowMin * 60_000) }, OR: or },
		select: { action: true, target: true, ip: true, at: true },
		orderBy: { at: "desc" },
		take: 300,
	})
	if (rows.length === 0) return idle
	const byUser = streak(rows.filter((r) => r.target === username))
	const byIp = s.perIp && ip ? streak(rows.filter((r) => r.ip === ip)) : { failures: 0, lastAt: 0 }
	const useIp = byIp.failures > byUser.failures
	const hit = useIp ? byIp : byUser
	const state: LoginGuardState = { locked: false, retryAfterSec: 0, failures: hit.failures, maxFailures: s.maxFailures, scope: useIp ? "ip" : "user" }
	if (hit.failures < s.maxFailures) return state
	const retryAfterSec = Math.ceil((hit.lastAt + s.lockMin * 60_000 - Date.now()) / 1000)
	return retryAfterSec > 0 ? { ...state, locked: true, retryAfterSec } : state
}

/** Audits + alerts once per lock window — never on every blocked attempt. */
export async function noteLoginLocked(usernameRaw: string, ip: string | null | undefined, state: LoginGuardState): Promise<void> {
	try {
		const s = await getSecuritySettings()
		const username = normUser(usernameRaw)
		const target = state.scope === "ip" && ip ? ip : username
		const already = await prisma.auditLog.findFirst({
			where: { action: "auth.login_locked", target, at: { gte: new Date(Date.now() - s.lockMin * 60_000) } },
			select: { id: true },
		})
		if (already) return
		await audit(null, "auth.login_locked", target, { username, scope: state.scope, failures: state.failures, lockMin: s.lockMin }, ip ?? null)
		if (!s.notifyLock) return
		const text = [
			"🚫 <b>قفل موقت ورود</b>",
			`🏷 ${tgEscape(brandName())}`,
			`👤 ${tgEscape(username)}`,
			`🌐 IP: <code>${tgEscape(ip || "—")}</code>`,
			`❌ ${state.failures} تلاش ناموفق`,
			`⏳ ${s.lockMin} دقیقه`,
		].join("\n")
		await notify("auth.login_locked", text, {
			dedupeKey: `auth.login_locked:${target}:${Math.floor(Date.now() / (s.lockMin * 60_000))}`,
			targetId: null,
			recipients: { ownerOnly: true },
		})
	} catch (err) {
		console.error("[srpanel] noteLoginLocked failed:", err instanceof Error ? err.message : err)
	}
}

/** Signs every other browser out; the token passed in (the current one) stays valid. */
export async function revokeOtherSessions(adminId: string, keepToken?: string | null): Promise<number> {
	const r = await prisma.session.deleteMany({ where: { adminId, ...(keepToken ? { NOT: { tokenHash: sha256(keepToken) } } : {}) } })
	return r.count
}

export type LoginSecuritySnapshot = {
	failures24h: number
	locks24h: number
	lastFailureAt: string | null
	lastLockAt: string | null
	activeSessions: number
}

/** Small health card for the settings UI. */
export async function loginSecuritySnapshot(): Promise<LoginSecuritySnapshot> {
	const since = new Date(Date.now() - 86_400_000)
	const [failures24h, locks24h, lastFailure, lastLock, activeSessions] = await Promise.all([
		prisma.auditLog.count({ where: { action: "auth.login_failed", at: { gte: since } } }),
		prisma.auditLog.count({ where: { action: "auth.login_locked", at: { gte: since } } }),
		prisma.auditLog.findFirst({ where: { action: "auth.login_failed" }, orderBy: { at: "desc" }, select: { at: true } }),
		prisma.auditLog.findFirst({ where: { action: "auth.login_locked" }, orderBy: { at: "desc" }, select: { at: true } }),
		prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
	])
	return {
		failures24h,
		locks24h,
		lastFailureAt: lastFailure ? lastFailure.at.toISOString() : null,
		lastLockAt: lastLock ? lastLock.at.toISOString() : null,
		activeSessions,
	}
}
