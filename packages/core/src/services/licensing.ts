/**
 * Premium licensing — one license per install (panel-wide).
 *
 * The person who installed the panel receives a 12-character code from the vendor
 * and activates it once in Settings › License; from that moment on every admin of
 * that install gets the premium features. A code binds to the install (Setting
 * `instance_id`), never to a single admin.
 *
 * Activation order: remote license API (`SRP_LICENSE_API`) → offline env list
 * (`SRP_LICENSE_KEYS`) → the local mint store (this same code base also powers the
 * vendor's master panel). Everything lives in the Setting table — no schema change.
 */
import { randomBytes, randomUUID } from "node:crypto"
import type { Admin } from "@srpanel/db"
import { z } from "zod"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { getSetting, panelUrl, setSetting } from "./settings"

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
const isPlan = (v: string): v is LicensePlan => (LICENSE_PLANS as readonly string[]).includes(v)

/* ---------- codes ---------- */

/** Codes are exactly 12 characters, no dashes, no prefix. */
export const CODE_LENGTH = 12
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const DAY_MS = 86_400_000

function newCode(): string {
	const bytes = randomBytes(CODE_LENGTH)
	let s = ""
	for (let i = 0; i < CODE_LENGTH; i += 1) s += CODE_CHARS[bytes[i] % CODE_CHARS.length]
	return s
}

/** Spaces, dashes and the legacy «SRP-» prefix are ignored, so old codes keep working. */
export function normalizeCode(raw: string): string {
	const s = String(raw ?? "")
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "")
	return s.length === CODE_LENGTH + 3 && s.startsWith("SRP") ? s.slice(3) : s
}

export const isCodeShaped = (raw: string): boolean => normalizeCode(raw).length === CODE_LENGTH

/* ---------- environment ---------- */

/** Base URL of the vendor panel that validates codes, e.g. https://my.srpanel.ir */
export const licenseApiBase = (): string => (process.env.SRP_LICENSE_API || "").trim().replace(/\/+$/, "")
/** Vendor switch: premium stays locked until a code is activated, no owner opt-out. */
export const licenseForced = (): boolean => /^(1|true|yes|on)$/i.test((process.env.SRP_LICENSE_REQUIRED || "").trim())
const appVersion = (): string => process.env.SRP_VERSION || ""

/* ---------- stored shapes ---------- */

export const licenseSchema = z.object({
	code: z.string().default(""),
	plan: z.enum(["FREE", "PLUS", "PRO"]).default("PRO"),
	/** explicit features win over the plan preset */
	features: z.array(z.string()).default([]),
	/** validity after activation in days, 0 = perpetual */
	days: z.number().int().min(0).max(3650).default(0),
	note: z.string().max(200).default(""),
	createdAt: z.string().default(""),
	/** bound install, empty while the code is unused */
	instanceId: z.string().default(""),
	instanceUrl: z.string().default(""),
	activatedAt: z.string().default(""),
	expiresAt: z.string().default(""),
	revoked: z.boolean().default(false),
})
export type License = z.infer<typeof licenseSchema>

export const licensingSchema = z.object({
	/** owner switch of this install; the env flag overrides it */
	enforced: z.boolean().default(false),
	keys: z.record(licenseSchema).default({}),
})
export type Licensing = z.infer<typeof licensingSchema>

/** The license this very install runs on. */
export const instanceLicenseSchema = z.object({
	code: z.string().default(""),
	plan: z.enum(["FREE", "PLUS", "PRO"]).default("FREE"),
	features: z.array(z.string()).default([]),
	activatedAt: z.string().default(""),
	expiresAt: z.string().default(""),
	lastCheck: z.string().default(""),
	source: z.enum(["remote", "local", "env"]).default("local"),
	/** last verification message, e.g. why a re-check failed */
	note: z.string().default(""),
})
export type InstanceLicense = z.infer<typeof instanceLicenseSchema>

const instanceIdSchema = z.object({ id: z.string().default("") })

export const getLicensing = () => getSetting("licensing", licensingSchema)
const persist = (v: Licensing) => setSetting("licensing", licensingSchema, v)
export const getInstanceLicense = () => getSetting("instance_license", instanceLicenseSchema, 10_000)
const persistInstance = (v: InstanceLicense) => setSetting("instance_license", instanceLicenseSchema, v)

/** Stable id of this installation, generated once on first use. */
export async function panelInstanceId(): Promise<string> {
	const row = await getSetting("instance_id", instanceIdSchema, 300_000)
	if (row.id) return row.id
	const id = randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()
	return (await setSetting("instance_id", instanceIdSchema, { id })).id
}

/* ---------- status ---------- */

export type LicenseStatus = "unused" | "active" | "expired" | "revoked" | "free"

export function licenseStatus(l: License): LicenseStatus {
	if (l.revoked) return "revoked"
	if (!l.instanceId) return "unused"
	if (l.expiresAt && new Date(l.expiresAt).getTime() < Date.now()) return "expired"
	return "active"
}

export function licenseFeatures(l: Pick<License, "features" | "plan">): LicenseFeature[] {
	const explicit = l.features.filter(isFeature)
	return explicit.length ? explicit : planFeatures(l.plan)
}

export interface LicenseDto extends License {
	status: LicenseStatus
	effective: LicenseFeature[]
}

export const licenseDto = (l: License): LicenseDto => ({ ...l, status: licenseStatus(l), effective: licenseFeatures(l) })

export function panelStatus(l: InstanceLicense): LicenseStatus {
	if (!l.code) return "free"
	if (l.expiresAt && new Date(l.expiresAt).getTime() < Date.now()) return "expired"
	return "active"
}

export interface PanelLicenseDto extends InstanceLicense {
	instanceId: string
	status: LicenseStatus
	effective: LicenseFeature[]
	/** premium is really locked right now */
	enforced: boolean
	/** locked by the environment, the owner switch cannot turn it off */
	forced: boolean
	/** a remote validation endpoint is configured */
	api: boolean
}

/* ---------- entitlements (panel-wide) ---------- */

export interface Entitlements {
	enforced: boolean
	plan: LicensePlan
	features: LicenseFeature[]
	code: string
	expiresAt: string
	status: LicenseStatus
	source: string
}

export async function enforcementOn(): Promise<boolean> {
	if (licenseForced()) return true
	return (await getLicensing()).enforced
}

/** No actor: the whole install shares one entitlement set. */
export async function entitlements(): Promise<Entitlements> {
	const lic = await getInstanceLicense()
	const status = panelStatus(lic)
	const live = status === "active"
	if (!(await enforcementOn())) {
		return { enforced: false, plan: live ? lic.plan : "PRO", features: [...LICENSE_FEATURES], code: lic.code, expiresAt: lic.expiresAt, status: live ? "active" : "free", source: lic.source }
	}
	return { enforced: true, plan: live ? lic.plan : "FREE", features: live ? licenseFeatures(lic) : [], code: lic.code, expiresAt: lic.expiresAt, status, source: lic.source }
}

export async function hasFeature(feature: LicenseFeature): Promise<boolean> {
	return (await entitlements()).features.includes(feature)
}

/** Guard for premium routes: throws a Persian 403 when the install lacks the feature. */
export async function assertFeature(feature: LicenseFeature): Promise<void> {
	if (await hasFeature(feature)) return
	throw new ForbiddenError("این بخش نیازمند لایسنس پرمیوم است: " + LICENSE_FEATURE_LABELS[feature])
}

export async function panelLicenseDto(): Promise<PanelLicenseDto> {
	const lic = await getInstanceLicense()
	const status = panelStatus(lic)
	return {
		...lic,
		instanceId: await panelInstanceId(),
		status,
		effective: status === "active" ? licenseFeatures(lic) : [],
		enforced: await enforcementOn(),
		forced: licenseForced(),
		api: !!licenseApiBase(),
	}
}

/* ---------- vendor side: redeem a code for an install ---------- */

export interface RedeemInput {
	code: string
	instanceId: string
	url?: string
	version?: string
}

export interface RedeemResult {
	code: string
	plan: LicensePlan
	features: LicenseFeature[]
	expiresAt: string
	activatedAt: string
}

/**
 * Binds a minted code to an install and answers its plan/features. Runs on the
 * vendor's panel (or locally when no remote API is configured) and is idempotent:
 * the same install may re-check its own code as often as it likes.
 */
export async function redeemLicense(input: RedeemInput): Promise<RedeemResult> {
	const key = normalizeCode(input.code)
	const instanceId = String(input.instanceId ?? "").trim().slice(0, 80)
	if (key.length !== CODE_LENGTH) throw new AppError("کد لایسنس باید ۱۲ کاراکتر باشد")
	if (!instanceId) throw new AppError("شناسهٔ نصب ارسال نشده است")
	const cfg = await getLicensing()
	const current = cfg.keys[key]
	if (!current) throw new NotFoundError("کد لایسنس پیدا نشد")
	if (current.revoked) throw new ForbiddenError("این لایسنس لغو شده است")
	if (current.instanceId && current.instanceId !== instanceId) throw new AppError("این لایسنس قبلاً روی نصب دیگری فعال شده است")
	const now = new Date()
	const next: License =
		current.instanceId === instanceId
			? { ...current, instanceUrl: (input.url ?? current.instanceUrl).slice(0, 200) }
			: {
					...current,
					instanceId,
					instanceUrl: String(input.url ?? "").slice(0, 200),
					activatedAt: now.toISOString(),
					expiresAt: current.days > 0 ? new Date(now.getTime() + current.days * DAY_MS).toISOString() : "",
				}
	if (licenseStatus(next) === "expired") throw new AppError("مدت این لایسنس به پایان رسیده است")
	await persist({ ...cfg, keys: { ...cfg.keys, [key]: next } })
	return { code: key, plan: next.plan, features: licenseFeatures(next), expiresAt: next.expiresAt, activatedAt: next.activatedAt }
}

/* ---------- customer side: activate on this install ---------- */

function asRecord(v: unknown): Record<string, unknown> {
	return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

async function verifyRemote(base: string, body: RedeemInput): Promise<RedeemResult> {
	const ctrl = new AbortController()
	const timer = setTimeout(() => ctrl.abort(), 9_000)
	try {
		const res = await fetch(base + "/api/license/verify", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			signal: ctrl.signal,
			cache: "no-store",
		})
		const payload = asRecord(await res.json().catch(() => null))
		if (!res.ok) throw new AppError(String(payload.error ?? "سرور لایسنس این کد را تایید نکرد"))
		const plan = isPlan(String(payload.plan)) ? (String(payload.plan) as LicensePlan) : "PRO"
		const features = Array.isArray(payload.features) ? (payload.features as unknown[]).map(String).filter(isFeature) : []
		return {
			code: normalizeCode(String(payload.code ?? body.code)),
			plan,
			features,
			expiresAt: payload.expiresAt ? String(payload.expiresAt) : "",
			activatedAt: payload.activatedAt ? String(payload.activatedAt) : new Date().toISOString(),
		}
	} finally {
		clearTimeout(timer)
	}
}

/** Offline fallback: `SRP_LICENSE_KEYS="CODE:PRO:365,CODE2:PLUS"` */
function envLicense(code: string): { plan: LicensePlan; days: number } | null {
	for (const part of (process.env.SRP_LICENSE_KEYS || "").split(/[,;\s]+/)) {
		if (!part) continue
		const bits = part.split(":")
		if (normalizeCode(bits[0] ?? "") !== code) continue
		const raw = String(bits[1] ?? "").toUpperCase()
		const days = Math.max(0, Math.round(Number(bits[2] ?? 0) || 0))
		return { plan: isPlan(raw) ? (raw as LicensePlan) : "PRO", days }
	}
	return null
}

/**
 * Owner of this install: activate premium for the whole panel with a 12-char code.
 */
export async function activatePanelLicense(actor: Admin, rawCode: string): Promise<InstanceLicense> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const code = normalizeCode(rawCode)
	if (code.length !== CODE_LENGTH) throw new AppError("کد لایسنس باید ۱۲ کاراکتر باشد")
	const instanceId = await panelInstanceId()
	const payload: RedeemInput = { code, instanceId, url: panelUrl(), version: appVersion() }
	const base = licenseApiBase()
	let result: RedeemResult | null = null
	let source: InstanceLicense["source"] = "local"
	let remoteError = ""
	if (base) {
		try {
			result = await verifyRemote(base, payload)
			source = "remote"
		} catch (err) {
			remoteError = err instanceof Error ? err.message : String(err)
		}
	}
	if (!result) {
		const offline = envLicense(code)
		if (offline) {
			const now = new Date()
			result = {
				code,
				plan: offline.plan,
				features: planFeatures(offline.plan),
				expiresAt: offline.days > 0 ? new Date(now.getTime() + offline.days * DAY_MS).toISOString() : "",
				activatedAt: now.toISOString(),
			}
			source = "env"
		}
	}
	if (!result) {
		try {
			result = await redeemLicense(payload)
			source = "local"
		} catch (err) {
			if (remoteError) throw new AppError(remoteError)
			throw err
		}
	}
	const saved = await persistInstance({
		code: result.code,
		plan: result.plan,
		features: result.features,
		activatedAt: result.activatedAt || new Date().toISOString(),
		expiresAt: result.expiresAt,
		lastCheck: new Date().toISOString(),
		source,
		note: "",
	})
	await audit(actor.id, "license.panel_activate", instanceId, { code: result.code, plan: result.plan, source })
	return saved
}

/** Re-check the stored code; an unreachable vendor keeps the current license (grace). */
export async function refreshPanelLicense(actor: Admin): Promise<InstanceLicense> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const current = await getInstanceLicense()
	if (!current.code) throw new AppError("هنوز لایسنسی روی این پنل فعال نشده است")
	try {
		return await activatePanelLicense(actor, current.code)
	} catch (err) {
		const note = (err instanceof Error ? err.message : String(err)).slice(0, 200)
		return await persistInstance({ ...current, lastCheck: new Date().toISOString(), note })
	}
}

export async function clearPanelLicense(actor: Admin): Promise<InstanceLicense> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const current = await getInstanceLicense()
	const saved = await persistInstance({ code: "", plan: "FREE", features: [], activatedAt: "", expiresAt: "", lastCheck: "", source: "local", note: "" })
	await audit(actor.id, "license.panel_clear", await panelInstanceId(), { code: current.code })
	return saved
}

/* ---------- vendor operations (mint store) ---------- */

export async function setLicensingEnforced(actor: Admin, enforced: boolean): Promise<Licensing> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const cfg = await getLicensing()
	const next = await persist({ ...cfg, enforced })
	await audit(actor.id, "license.enforce", actor.id, { enforced })
	return next
}

export async function createLicenses(
	actor: Admin,
	input: { count?: number; plan?: LicensePlan; features?: string[]; days?: number; note?: string },
): Promise<LicenseDto[]> {
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
		const l: License = {
			code,
			plan,
			features,
			days,
			note,
			createdAt: new Date().toISOString(),
			instanceId: "",
			instanceUrl: "",
			activatedAt: "",
			expiresAt: "",
			revoked: false,
		}
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
	await audit(actor.id, "license.revoke", l.instanceId || key, { code: key, revoked })
	return licenseDto(next)
}

/** Unbind a code so it can be handed to another install. */
export async function releaseLicense(actor: Admin, code: string): Promise<LicenseDto> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const cfg = await getLicensing()
	const key = normalizeCode(code)
	const l = cfg.keys[key]
	if (!l) throw new NotFoundError("کد لایسنس پیدا نشد")
	const next = { ...l, instanceId: "", instanceUrl: "", activatedAt: "", expiresAt: "" }
	await persist({ ...cfg, keys: { ...cfg.keys, [key]: next } })
	await audit(actor.id, "license.release", l.instanceId || key, { code: key })
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

export async function listLicenses(): Promise<LicenseDto[]> {
	const cfg = await getLicensing()
	return Object.values(cfg.keys)
		.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
		.map(licenseDto)
}
