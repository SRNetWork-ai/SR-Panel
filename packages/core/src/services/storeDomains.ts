import { prisma, type Admin } from "@srpanel/db"
import { z } from "zod"
import { randomToken } from "../security/token"
import { AppError, NotFoundError } from "../util/errors"
import { audit } from "./audit"
import { brandName, getSetting, panelUrl, setSetting } from "./settings"
import { storeSettingsByAdminId, storeUrlFor } from "./storeSettings"

/**
 * Per-admin custom shop domain.
 *
 * The live value is `Brand.customDomain` - that is what `getStoreByHost`
 * resolves - so nothing here needs a schema change: the requested host, its
 * loop-back token and the last check result live in the `Setting` table, and a
 * host only becomes live once it has been verified.
 *
 * Verification is a loop-back: we ask `http(s)://<host>/api/health/domain` for
 * the token this panel generated. Only a domain that really points at this
 * install can answer with it.
 */

const KEY = "store_domains"
const CHECK_PATH = "/api/health/domain"

const recordSchema = z.object({
	host: z.string(),
	token: z.string(),
	createdAt: z.string(),
	verifiedAt: z.string().nullable().default(null),
	lastError: z.string().nullable().default(null),
})
const bookSchema = z.object({ items: z.record(recordSchema).default({}) })

export type StoreDomainRecord = z.infer<typeof recordSchema>

export interface StoreDomainCheck {
	url: string
	ok: boolean
	status: number | null
	error: string | null
}

export interface StoreDomainStatus {
	host: string | null
	/** verified at least once */
	verified: boolean
	/** this domain is the one currently serving the shop */
	live: boolean
	token: string | null
	createdAt: string | null
	verifiedAt: string | null
	lastError: string | null
	/** loop-back endpoint used by the check */
	checkUrl: string | null
	/** public shop address (with the domain applied when it is live) */
	shopUrl: string | null
	/** where the A record has to point */
	panelHost: string
	slug: string | null
}

const HOST_RE = /^(?=.{4,190}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/

/** `https://Shop.Example.com/x` becomes `shop.example.com`; empty when it is not a usable domain. */
export function normalizeDomain(input: string | null | undefined): string {
	let host = (input ?? "").trim().toLowerCase()
	if (!host) return ""
	if (host.includes("://")) {
		try {
			host = new URL(host).hostname
		} catch {
			return ""
		}
	}
	host = host.split("/")[0]
	host = host.split(":")[0]
	host = host.replace(/^\*\./, "").replace(/\.+$/, "")
	return HOST_RE.test(host) ? host : ""
}

/** Hostname of the panel itself: it can never become a shop domain. */
export function panelHostname(): string {
	try {
		return new URL(panelUrl()).hostname.toLowerCase()
	} catch {
		return ""
	}
}

const bookOf = () => getSetting(KEY, bookSchema, 5_000)
const saveBook = (items: Record<string, StoreDomainRecord>) => setSetting(KEY, bookSchema, { items })

/** Token this panel serves for `host` - used by the public loop-back route. */
export async function domainTokenForHost(host: string | null | undefined): Promise<string | null> {
	const h = normalizeDomain(host)
	if (!h) return null
	const { items } = await bookOf()
	for (const rec of Object.values(items)) if (rec.host === h) return rec.token
	return null
}

export async function storeDomainOf(adminId: string): Promise<StoreDomainRecord | null> {
	const { items } = await bookOf()
	return items[adminId] ?? null
}

export async function storeDomainStatus(actor: Pick<Admin, "id">): Promise<StoreDomainStatus> {
	const [rec, brand, store] = await Promise.all([storeDomainOf(actor.id), prisma.brand.findUnique({ where: { adminId: actor.id } }), storeSettingsByAdminId(actor.id)])
	const host = rec?.host ?? brand?.customDomain ?? null
	const live = !!host && brand?.customDomain === host
	return {
		host,
		verified: live || !!rec?.verifiedAt,
		live,
		token: rec?.token ?? null,
		createdAt: rec?.createdAt ?? null,
		verifiedAt: rec?.verifiedAt ?? null,
		lastError: rec?.lastError ?? null,
		checkUrl: host ? "http://" + host + CHECK_PATH : null,
		shopUrl: store ? storeUrlFor(store, live ? host : null) : null,
		panelHost: panelHostname(),
		slug: store?.slug ?? null,
	}
}

async function clearLive(adminId: string): Promise<void> {
	const brand = await prisma.brand.findUnique({ where: { adminId } })
	if (brand?.customDomain) await prisma.brand.update({ where: { adminId }, data: { customDomain: null } })
}

/** Registers (or replaces) the requested domain. It is not live until it is verified. */
export async function setStoreDomain(actor: Pick<Admin, "id">, input: string): Promise<StoreDomainStatus> {
	const host = normalizeDomain(input)
	if (!host) throw new AppError("\u062f\u0627\u0645\u0646\u0647 \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a\u061b \u0645\u062b\u0644 shop.example.com \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f")
	if (host === panelHostname()) throw new AppError("\u062f\u0627\u0645\u0646\u0647 \u062e\u0648\u062f \u067e\u0646\u0644 \u0631\u0627 \u0646\u0645\u06cc\u200c\u062a\u0648\u0627\u0646 \u062f\u0627\u0645\u0646\u0647 \u0641\u0631\u0648\u0634\u06af\u0627\u0647 \u06a9\u0631\u062f")
	const [{ items }, clash] = await Promise.all([bookOf(), prisma.brand.findFirst({ where: { customDomain: host, NOT: { adminId: actor.id } } })])
	if (clash) throw new AppError("\u0627\u06cc\u0646 \u062f\u0627\u0645\u0646\u0647 \u0628\u0631\u0627\u06cc \u0627\u062f\u0645\u06cc\u0646 \u062f\u06cc\u06af\u0631\u06cc \u062b\u0628\u062a \u0634\u062f\u0647 \u0627\u0633\u062a")
	for (const [adminId, rec] of Object.entries(items)) {
		if (rec.host === host && adminId !== actor.id) throw new AppError("\u0627\u06cc\u0646 \u062f\u0627\u0645\u0646\u0647 \u062f\u0631 \u0627\u0646\u062a\u0638\u0627\u0631 \u062a\u0623\u06cc\u06cc\u062f \u0627\u062f\u0645\u06cc\u0646 \u062f\u06cc\u06af\u0631\u06cc \u0627\u0633\u062a")
	}
	const prev = items[actor.id]
	const same = prev?.host === host
	const next: StoreDomainRecord = {
		host,
		token: same && prev ? prev.token : randomToken(18),
		createdAt: same && prev ? prev.createdAt : new Date().toISOString(),
		verifiedAt: same && prev ? prev.verifiedAt : null,
		lastError: null,
	}
	await saveBook({ ...items, [actor.id]: next })
	// a different host has to prove itself again before the shop moves
	if (!same) await clearLive(actor.id)
	await audit(actor.id, "store.domain.set", actor.id, { host })
	return storeDomainStatus(actor)
}

export async function removeStoreDomain(actor: Pick<Admin, "id">): Promise<StoreDomainStatus> {
	const { items } = await bookOf()
	const rec = items[actor.id]
	const rest: Record<string, StoreDomainRecord> = { ...items }
	delete rest[actor.id]
	await saveBook(rest)
	await clearLive(actor.id)
	await audit(actor.id, "store.domain.remove", actor.id, { host: rec?.host ?? null })
	return storeDomainStatus(actor)
}

async function probe(url: string, token: string): Promise<StoreDomainCheck> {
	try {
		const res = await fetch(url, { cache: "no-store", redirect: "follow", headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) })
		const body = (await res.json().catch(() => null)) as { token?: unknown } | null
		const got = typeof body?.token === "string" ? body.token : ""
		if (!got) return { url, ok: false, status: res.status, error: "\u067e\u0627\u0633\u062e \u0627\u06cc\u0646 \u0646\u0634\u0627\u0646\u06cc \u0634\u0628\u06cc\u0647 \u067e\u0646\u0644 \u0634\u0645\u0627 \u0646\u06cc\u0633\u062a (\u06a9\u062f \u062a\u0623\u06cc\u06cc\u062f \u0628\u0631\u0646\u06af\u0634\u062a)" }
		if (got !== token) return { url, ok: false, status: res.status, error: "\u06a9\u062f \u062a\u0623\u06cc\u06cc\u062f \u0628\u0631\u06af\u0634\u062a\u06cc \u0628\u0627 \u06a9\u062f \u0627\u06cc\u0646 \u067e\u0646\u0644 \u06cc\u06a9\u06cc \u0646\u06cc\u0633\u062a" }
		return { url, ok: true, status: res.status, error: null }
	} catch (err) {
		return { url, ok: false, status: null, error: err instanceof Error ? err.message : "\u062f\u0633\u062a\u0631\u0633\u06cc \u0628\u0647 \u062f\u0627\u0645\u0646\u0647 \u0645\u0645\u06a9\u0646 \u0646\u0634\u062f" }
	}
}

/** Loop-back check; on success the host is written to `Brand.customDomain` and the shop moves there. */
export async function verifyStoreDomain(actor: Pick<Admin, "id">): Promise<{ status: StoreDomainStatus; checks: StoreDomainCheck[] }> {
	const rec = await storeDomainOf(actor.id)
	if (!rec) throw new NotFoundError("\u0647\u0646\u0648\u0632 \u062f\u0627\u0645\u0646\u0647\u200c\u0627\u06cc \u062b\u0628\u062a \u0646\u0634\u062f\u0647 \u0627\u0633\u062a")
	const checks: StoreDomainCheck[] = []
	for (const scheme of ["https", "http"] as const) {
		const check = await probe(scheme + "://" + rec.host + CHECK_PATH, rec.token)
		checks.push(check)
		if (check.ok) break
	}
	const passed = checks.some((c) => c.ok)
	const error = passed ? null : (checks.find((c) => c.error)?.error ?? "\u062a\u0623\u06cc\u06cc\u062f \u062f\u0627\u0645\u0646\u0647 \u0627\u0646\u062c\u0627\u0645 \u0646\u0634\u062f")
	const { items } = await bookOf()
	await saveBook({ ...items, [actor.id]: { ...rec, verifiedAt: passed ? new Date().toISOString() : rec.verifiedAt, lastError: error } })
	if (passed) {
		const brand = await prisma.brand.findUnique({ where: { adminId: actor.id } })
		if (brand) await prisma.brand.update({ where: { adminId: actor.id }, data: { customDomain: rec.host } })
		else await prisma.brand.create({ data: { adminId: actor.id, name: brandName(), primaryColor: "#8b5cf6", accentColor: "#22d3ee", customDomain: rec.host } })
	}
	await audit(actor.id, passed ? "store.domain.verify" : "store.domain.verify_failed", actor.id, { host: rec.host, error })
	return { status: await storeDomainStatus(actor), checks }
}
