/**
 * Premium licensing.
 *
 * The panel owner mints license codes, hands them to an admin / reseller and the
 * admin activates the code inside its own panel. Every code carries a plan (or an
 * explicit feature list) and an optional validity in days. While `enforced` is off
 * every feature stays unlocked, so existing installs keep working untouched.
 *
 * Everything lives in the Setting table (key `licensing`) — no schema change.
 */
import { randomBytes } from "node:crypto"
import { prisma, type Admin } from "@srpanel/db"
import { z } from "zod"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { getSetting, setSetting } from "./settings"

/* ---------- catalogue ---------- */

export const LICENSE_FEATURES = [
	"store",
	"branding",
	"domain",
	"salesBot",
	"monitoring",
	"backupCenter",
	"wallet",
	"discounts",
	"paymentPlugin",
	"stars",
	"clientTemplates",
	"sharedPanel",
] as const
export type LicenseFeature = (typeof LICENSE_FEATURES)[number]

/** Persian labels, shown in the panel and in error messages. */
export const LICENSE_FEATURE_LABELS: Record<LicenseFeature, string> = {
	store: "فروشگاه وب و مینی‌اپ",
	branding: "برندینگ اختصاصی",
	domain: "دامنهٔ اختصاصی",
	salesBot: "ربات فروش تلگرام",
	monitoring: "مانیتورینگ و Incident",
	backupCenter: "بکاپ‌سنتر زمان‌بندی‌شده",
	wallet: "کیف پول و پرداخت",
	discounts: "کد تخفیف و افزونهٔ محصول",
	paymentPlugin: "افزونهٔ پرداخت",
	stars: "Telegram Stars",
	clientTemplates: "قالب کلاینت",
	sharedPanel: "پنل اشتراکی",
}

export const LICENSE_PLANS = ["FREE", "PLUS", "PRO"] as const
export type LicensePlan = (typeof LICENSE_PLANS)[number]

const PLAN_FEATURES: Record<LicensePlan, LicenseFeature[]> = {
	FREE: [],
	PLUS: ["store", "branding", "salesBot", "wallet", "discounts"],
	PRO: [...LICENSE_FEATURES],
}

export const planFeatures = (plan: LicensePlan): LicenseFeature[] => [...PLAN_FEATURES[plan]]

const isFeature = (v: string): v is LicenseFeature => (LICENSE_FEATURES as readonly string[]).includes(v)

/* ---------- settings ---------- */

export const licenseSchema = z.object({
	code: z.string().default(""),
	plan: z.enum(["FREE", "PLUS", "PRO"]).default("PRO"),
	/** explicit features win over the plan preset */
	features: z.array(z.string()).default([]),
	/** validity after activation in days, 0 = perpetual */
	days: z.number().int().min(0).max(3650).default(0),
	note: z.string().max(200).default(""),
	createdAt: z.string().default(""),
	/** bound admin, empty while unused */
	adminId: z.string().default(""),
	activatedAt: z.string().default(""),
	expiresAt: z.string().default(""),
	revoked: z.boolean().default(false),
})
export type License = z.infer<typeof licenseSchema>

export const licensingSchema = z.object({
	/** owner master gate: while off nothing is locked */
	enforced: z.boolean().default(false),
	keys: z.record(licenseSchema).default({}),
})
export type Licensing = z.infer<typeof licensingSchema>

export const getLicensing = () => getSetting("licensing", licensingSchema)
const persist = (v: Licensing) => setSetting("licensing", licensingSchema, v)

/* ---------- codes ---------- */

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function newCode(): string {
	const bytes = randomBytes(12)
	let s = ""
	for (let i = 0; i < 12; i += 1) s += CODE_CHARS[bytes[i] % CODE_CHARS.length]
	return "SRP-" + s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12)
}

export const normalizeCode = (v: string) => v.trim().toUpperCase().replace(/\s+/g, "")

/* ---------- status & dto ---------- */

export type LicenseStatus = "unused" | "active" | "expired" | "revoked" | "free"

export function licenseStatus(l: License): LicenseStatus {
	if (l.revoked) return "revoked"
	if (!l.adminId) return "unused"
	if (l.expiresAt && new Date(l.expiresAt).getTime() < Date.now()) return "expired"
	return "active"
}

export interface LicenseDto extends License {
	status: LicenseStatus
	/** effective feature list of this code */
	effective: LicenseFeature[]
}

export interface LicenseRow extends LicenseDto {
	adminName: string
}

export function licenseFeatures(l: License): LicenseFeature[] {
	const explicit = l.features.filter(isFeature)
	return explicit.length ? explicit : planFeatures(l.plan)
}

export const licenseDto = (l: License): LicenseDto => ({ ...l, status: licenseStatus(l), effective: licenseFeatures(l) })

/* ---------- entitlements ---------- */

export interface Entitlements {
	/** false = licensing is off, everything is unlocked */
	enforced: boolean
	plan: LicensePlan
	features: LicenseFeature[]
	code: string
	expiresAt: string
	status: LicenseStatus
}

type Actor = { id: string; role: string }

export function entitlementsFrom(cfg: Licensing, actor: Actor): Entitlements {
	if (!cfg.enforced || actor.role === "OWNER") {
		return { enforced: cfg.enforced, plan: "PRO", features: [...LICENSE_FEATURES], code: "", expiresAt: "", status: cfg.enforced ? "active" : "free" }
	}
	const mine = Object.values(cfg.keys).filter((k) => k.adminId === actor.id)
	const live = mine.find((k) => licenseStatus(k) === "active")
	if (live) return { enforced: true, plan: live.plan, features: licenseFeatures(live), code: live.code, expiresAt: live.expiresAt, status: "active" }
	const last = mine[0]
	return { enforced: true, plan: "FREE", features: [], code: last?.code ?? "", expiresAt: last?.expiresAt ?? "", status: last ? licenseStatus(last) : "free" }
}

export async function entitlements(actor: Actor): Promise<Entitlements> {
	return entitlementsFrom(await getLicensing(), actor)
}

export async function hasFeature(actor: Actor, feature: LicenseFeature): Promise<boolean> {
	const e = await entitlements(actor)
	return e.features.includes(feature)
}

/** Guard for premium routes: throws a Persian 403 when the admin lacks the feature. */
export async function assertFeature(actor: Actor, feature: LicenseFeature): Promise<void> {
	if (await hasFeature(actor, feature)) return
	throw new ForbiddenError("این بخش نیازمند لایسنس پرمیوم است: " + LICENSE_FEATURE_LABELS[feature])
}

/* ---------- owner operations ---------- */

export async function setLicensingEnforced(actor: Admin, enforced: boolean): Promise<Licensing> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const cfg = await getLicensing()
	const next = await persist({ ...cfg, enforced })
	await audit(actor.id, "license.enforce", actor.id, { enforced })
	return next
}

export async function createLicenses(actor: Admin, input: { count?: number; plan?: LicensePlan; features?: string[]; days?: number; note?: string }): Promise<LicenseDto[]> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const cfg = await getLicensing()
	const count = Math.min(50, Math.max(1, Math.round(input.count ?? 1)))
	const plan: LicensePlan = input.plan ?? "PRO"
	const features = (input.features ?? []).filter(isFeature)
	const days = Math.min(3650, Math.max(0, Math.round(input.days ?? 0)))
	const note = (input.note ?? "").slice(0, 200)
	const keys = { ...cfg.keys }
	const made: License[] = []
	for (let i = 0; i < count; i += 1) {
		let code = newCode()
		while (keys[code]) code = newCode()
		const l: License = { code, plan, features, days, note, createdAt: new Date().toISOString(), adminId: "", activatedAt: "", expiresAt: "", revoked: false }
		keys[code] = l
		made.push(l)
	}
	await persist({ ...cfg, keys })
	await audit(actor.id, "license.create", actor.id, { count, plan, days })
	return made.map(licenseDto)
}

export async function setLicenseRevoked(actor: Admin, code: string, revoked: boolean): Promise<LicenseDto> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const cfg = await getLicensing()
	const key = normalizeCode(code)
	const l = cfg.keys[key]
	if (!l) throw new NotFoundError("کد لایسنس پیدا نشد")
	const next = { ...l, revoked }
	await persist({ ...cfg, keys: { ...cfg.keys, [key]: next } })
	await audit(actor.id, "license.revoke", l.adminId || key, { code: key, revoked })
	return licenseDto(next)
}

/** Owner: unbind a code so it can be handed to somebody else. */
export async function releaseLicense(actor: Admin, code: string): Promise<LicenseDto> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const cfg = await getLicensing()
	const key = normalizeCode(code)
	const l = cfg.keys[key]
	if (!l) throw new NotFoundError("کد لایسنس پیدا نشد")
	const next = { ...l, adminId: "", activatedAt: "", expiresAt: "" }
	await persist({ ...cfg, keys: { ...cfg.keys, [key]: next } })
	await audit(actor.id, "license.release", l.adminId || key, { code: key })
	return licenseDto(next)
}

export async function deleteLicense(actor: Admin, code: string): Promise<{ ok: true }> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const cfg = await getLicensing()
	const key = normalizeCode(code)
	if (!cfg.keys[key]) throw new NotFoundError("کد لایسنس پیدا نشد")
	const keys = { ...cfg.keys }
	delete keys[key]
	await persist({ ...cfg, keys })
	await audit(actor.id, "license.delete", key, {})
	return { ok: true }
}

export async function listLicenses(): Promise<LicenseRow[]> {
	const cfg = await getLicensing()
	const rows = Object.values(cfg.keys).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
	const ids = Array.from(new Set(rows.map((r) => r.adminId).filter((v) => !!v)))
	const admins = ids.length ? await prisma.admin.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, displayName: true } }) : []
	const by = new Map(admins.map((a) => [a.id, a.displayName || a.username]))
	return rows.map((l) => ({ ...licenseDto(l), adminName: l.adminId ? by.get(l.adminId) ?? l.adminId : "" }))
}

/* ---------- activation ---------- */

/** Any admin: bind a code to itself. Codes are single-use and never transfer silently. */
export async function activateLicense(actor: Admin, rawCode: string): Promise<LicenseDto> {
	const cfg = await getLicensing()
	const key = normalizeCode(rawCode)
	const l = cfg.keys[key]
	if (!l) throw new NotFoundError("کد لایسنس پیدا نشد")
	if (l.revoked) throw new ForbiddenError("این لایسنس لغو شده است")
	if (l.adminId && l.adminId !== actor.id) throw new AppError("این لایسنس قبلاً برای حساب دیگری فعال شده است")
	const status = licenseStatus(l)
	if (l.adminId === actor.id) {
		if (status === "active") return licenseDto(l)
		throw new AppError("مدت این لایسنس به پایان رسیده است")
	}
	const now = new Date()
	const next: License = {
		...l,
		adminId: actor.id,
		activatedAt: now.toISOString(),
		expiresAt: l.days > 0 ? new Date(now.getTime() + l.days * 86_400_000).toISOString() : "",
	}
	await persist({ ...cfg, keys: { ...cfg.keys, [key]: next } })
	await audit(actor.id, "license.activate", actor.id, { code: key, plan: l.plan, days: l.days })
	return licenseDto(next)
}
