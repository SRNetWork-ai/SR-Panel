/**
 * Vendor install vs customer install.
 *
 * The source of this panel is public, so "who may mint licenses" cannot be a
 * plain env flag: vendor mode is unlocked by a secret whose sha256 is the only
 * thing stored here (SRP_VENDOR_KEY). Everywhere else the panel is a customer
 * install: premium stays locked until a code minted by the vendor is verified
 * against the vendor's license server, codes can never be minted locally, and
 * the license is re-checked in the background so a revoked code stops working.
 */
import { createHash } from "node:crypto"
import type { Admin } from "@srpanel/db"
import { AppError, ForbiddenError } from "../util/errors"
import { audit } from "./audit"
import { panelUrl, setSetting } from "./settings"
import {
	CODE_LENGTH,
	LICENSE_FEATURES,
	LICENSE_FEATURE_LABELS,
	getInstanceLicense,
	instanceLicenseSchema,
	licenseFeatures,
	normalizeCode,
	panelInstanceId,
	panelStatus,
	redeemLicense,
	type InstanceLicense,
	type LicenseFeature,
	type LicensePlan,
	type LicenseStatus,
} from "./licensing"

/** License server every customer install talks to; override with SRP_LICENSE_API. */
export const DEFAULT_LICENSE_API = "http://209.250.239.50"
/** Days a customer install keeps premium while the license server is unreachable. */
export const LICENSE_GRACE_DAYS = 7
/** How often the worker re-verifies the stored code. */
export const RECHECK_HOURS = 6
const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

const hash = (v: string) => createHash("sha256").update(v).digest("hex")

/** sha256 of the vendor master key. Rotate by replacing this one line. */
const VENDOR_KEY_HASH = "1f827d3a0528da6664d83e28d1dbc1df526e04f2cad50b475a37ed4ba1622e7b"

/** True only on the vendor's own panel: mints codes, answers verify, never locked. */
export function isVendorInstall(): boolean {
	const key = (process.env.SRP_VENDOR_KEY || "").trim()
	return key.length > 0 && hash(key) === VENDOR_KEY_HASH
}

export const vendorApiBase = (): string => (process.env.SRP_LICENSE_API || DEFAULT_LICENSE_API).trim().replace(/\/+$/, "")

/** Mint / revoke / list are vendor-only, whatever the local admin role says. */
export function assertVendor(): void {
	if (!isVendorInstall()) throw new ForbiddenError("ساخت کد لایسنس فقط روی پنل فروشنده ممکن است")
}

/* ---------- entitlements ---------- */

export interface PanelEntitlements {
	/** this install is the vendor master panel */
	vendor: boolean
	/** premium is locked right now */
	locked: boolean
	plan: LicensePlan
	features: LicenseFeature[]
	status: LicenseStatus
	code: string
	activatedAt: string
	expiresAt: string
	lastCheck: string
	source: string
	note: string
	/** verification is overdue but still inside the offline grace window */
	grace: boolean
	graceDays: number
	instanceId: string
	api: string
}

export async function panelEntitlements(): Promise<PanelEntitlements> {
	const lic = await getInstanceLicense()
	const common = {
		code: lic.code,
		activatedAt: lic.activatedAt,
		expiresAt: lic.expiresAt,
		lastCheck: lic.lastCheck,
		source: lic.source,
		note: lic.note,
		graceDays: LICENSE_GRACE_DAYS,
		instanceId: await panelInstanceId(),
		api: vendorApiBase(),
	}
	if (isVendorInstall()) {
		return { ...common, vendor: true, locked: false, plan: "PRO", features: [...LICENSE_FEATURES], status: "active", grace: false }
	}
	const status = panelStatus(lic)
	const age = lic.lastCheck ? Date.now() - new Date(lic.lastCheck).getTime() : Number.POSITIVE_INFINITY
	const stale = !(age <= LICENSE_GRACE_DAYS * DAY_MS)
	const live = status === "active" && !stale
	return {
		...common,
		vendor: false,
		locked: !live,
		plan: live ? lic.plan : "FREE",
		features: live ? licenseFeatures(lic) : [],
		status,
		grace: live && age > RECHECK_HOURS * HOUR_MS,
	}
}

export async function panelHasFeature(feature: LicenseFeature): Promise<boolean> {
	return (await panelEntitlements()).features.includes(feature)
}

/** Guard for premium routes: Persian 403 when this install is not licensed for it. */
export async function requirePremium(feature: LicenseFeature): Promise<void> {
	if (await panelHasFeature(feature)) return
	throw new ForbiddenError("این بخش نیازمند لایسنس پرمیوم است: " + LICENSE_FEATURE_LABELS[feature])
}

/* ---------- verification ---------- */

interface VerifyValue {
	code: string
	plan: LicensePlan
	features: LicenseFeature[]
	activatedAt: string
	expiresAt: string
}

/** `reachable: false` means network trouble; `true` means the vendor said no. */
type VerifyOutcome = { ok: true; value: VerifyValue } | { ok: false; reachable: boolean; error: string }

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {})
const isFeature = (v: string): v is LicenseFeature => (LICENSE_FEATURES as readonly string[]).includes(v)
const isPlan = (v: string): v is LicensePlan => v === "FREE" || v === "PLUS" || v === "PRO"

async function verifyRemote(code: string, instanceId: string): Promise<VerifyOutcome> {
	const body = JSON.stringify({ code, instanceId, url: panelUrl(), version: process.env.SRP_VERSION || "" })
	const res = await fetch(vendorApiBase() + "/api/license/verify", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body,
		cache: "no-store",
		signal: AbortSignal.timeout(9_000),
	}).catch(() => null)
	if (!res) return { ok: false, reachable: false, error: "سرور لایسنس در دسترس نیست" }
	const payload = asRecord(await res.json().catch(() => null))
	if (res.status >= 500) return { ok: false, reachable: false, error: "سرور لایسنس در دسترس نیست" }
	if (!res.ok) return { ok: false, reachable: true, error: String(payload.error ?? "سرور لایسنس این کد را تایید نکرد") }
	const planRaw = String(payload.plan ?? "")
	return {
		ok: true,
		value: {
			code: normalizeCode(String(payload.code ?? code)),
			plan: isPlan(planRaw) ? planRaw : "PRO",
			features: Array.isArray(payload.features) ? (payload.features as unknown[]).map(String).filter(isFeature) : [],
			activatedAt: payload.activatedAt ? String(payload.activatedAt) : new Date().toISOString(),
			expiresAt: payload.expiresAt ? String(payload.expiresAt) : "",
		},
	}
}

const persist = (v: InstanceLicense) => setSetting("instance_license", instanceLicenseSchema, v)

async function localRedeem(code: string, instanceId: string): Promise<VerifyValue> {
	const r = await redeemLicense({ code, instanceId, url: panelUrl(), version: process.env.SRP_VERSION || "" })
	return { code: r.code, plan: r.plan, features: r.features, activatedAt: r.activatedAt, expiresAt: r.expiresAt }
}

/** Owner of this install types the 12-character code once. */
export async function activateLicense(actor: Admin, rawCode: string): Promise<PanelEntitlements> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const code = normalizeCode(rawCode)
	if (code.length !== CODE_LENGTH) throw new AppError("کد لایسنس باید ۱۲ کاراکتر باشد")
	const instanceId = await panelInstanceId()
	const vendor = isVendorInstall()
	let value: VerifyValue
	if (vendor) {
		value = await localRedeem(code, instanceId)
	} else {
		const outcome = await verifyRemote(code, instanceId)
		if (!outcome.ok) throw new AppError(outcome.error)
		value = outcome.value
	}
	await persist({
		code: value.code,
		plan: value.plan,
		features: value.features,
		activatedAt: value.activatedAt || new Date().toISOString(),
		expiresAt: value.expiresAt,
		lastCheck: new Date().toISOString(),
		source: vendor ? "local" : "remote",
		note: "",
	})
	await audit(actor.id, "license.activate", instanceId, { code: value.code, plan: value.plan, vendor })
	return panelEntitlements()
}

/**
 * Re-verify the stored code. A network error keeps the license inside the grace
 * window; a code the vendor rejected (revoked / expired / unknown) locks the
 * panel right away.
 */
export async function recheckLicense(actor?: Admin): Promise<PanelEntitlements> {
	if (actor && actor.role !== "OWNER") throw new ForbiddenError()
	const current = await getInstanceLicense()
	if (!current.code) throw new AppError("هنوز لایسنسی روی این پنل فعال نشده است")
	if (isVendorInstall()) return panelEntitlements()
	const outcome = await verifyRemote(current.code, await panelInstanceId())
	if (outcome.ok) {
		await persist({
			...current,
			plan: outcome.value.plan,
			features: outcome.value.features,
			expiresAt: outcome.value.expiresAt,
			activatedAt: current.activatedAt || outcome.value.activatedAt,
			lastCheck: new Date().toISOString(),
			source: "remote",
			note: "",
		})
	} else if (outcome.reachable) {
		// the vendor answered «no»: drop the entitlement, keep the code for the log
		await persist({ ...current, plan: "FREE", features: [], expiresAt: "", lastCheck: "", note: outcome.error.slice(0, 200) })
	} else {
		await persist({ ...current, note: outcome.error.slice(0, 200) })
	}
	return panelEntitlements()
}

/** Worker job: keeps the license fresh; true when a check actually ran. */
export async function autoRecheckLicense(): Promise<boolean> {
	if (isVendorInstall()) return false
	const lic = await getInstanceLicense()
	if (!lic.code) return false
	const age = lic.lastCheck ? Date.now() - new Date(lic.lastCheck).getTime() : Number.POSITIVE_INFINITY
	if (age < RECHECK_HOURS * HOUR_MS) return false
	await recheckLicense()
	return true
}

export async function dropLicense(actor: Admin): Promise<PanelEntitlements> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const current = await getInstanceLicense()
	await persist({ code: "", plan: "FREE", features: [], activatedAt: "", expiresAt: "", lastCheck: "", source: "remote", note: "" })
	await audit(actor.id, "license.clear", await panelInstanceId(), { code: current.code })
	return panelEntitlements()
}
