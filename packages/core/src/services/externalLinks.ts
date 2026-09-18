import { z } from "zod"
import { decodeB64 } from "../subscription/nodes"
import { AppError } from "../util/errors"
import { audit } from "./audit"
import { getSetting, setSetting } from "./settings"

/**
 * External links: nodes and whole subscriptions that are *not* ours, merged into the
 * subscription output of every client.
 *
 * Real uses: a partner's server, a spare node that lives outside the panel, or a
 * second provider kept as a fallback while one of our servers is migrated. Stored in
 * the Setting key/value table (no schema change) and resolved at render time, so
 * disabling an entry updates every client's subscription instantly.
 */

export const EXTERNAL_LINKS_KEY = "externalLinks"

const MAX_ENTRIES = 24
const MAX_PER_ENTRY = 40
const MAX_TOTAL = 120
const TIMEOUT_MS = 6_000
const BODY_LIMIT = 256 * 1024
const OK_TTL_MS = 120_000
const FAIL_TTL_MS = 30_000

/** schemes an app can actually dial; everything else in a remote list is noise */
const NODE_SCHEMES: readonly string[] = [
	"vless",
	"vmess",
	"trojan",
	"ss",
	"ssr",
	"hysteria",
	"hysteria2",
	"hy2",
	"tuic",
	"wireguard",
	"anytls",
	"snell",
	"juicity",
	"socks5",
]

export const externalLinkSchema = z.object({
	id: z.string().trim().min(1).max(40),
	enabled: z.boolean().default(true),
	title: z.string().trim().max(80).default(""),
	/** "uri" = one share link, "sub" = a remote subscription URL we fetch */
	kind: z.enum(["uri", "sub"]).default("uri"),
	value: z.string().trim().min(3).max(4096),
})
export type ExternalLink = z.infer<typeof externalLinkSchema>

export const externalLinksSchema = z.object({ entries: z.array(externalLinkSchema).max(MAX_ENTRIES).default([]) })
export type ExternalLinkBook = z.infer<typeof externalLinksSchema>

export const externalLinkInputSchema = z.object({
	id: z.string().trim().max(40).optional(),
	enabled: z.boolean().optional(),
	title: z.string().trim().max(80).optional(),
	kind: z.enum(["uri", "sub"]).optional(),
	value: z.string().trim().min(3).max(4096),
})
export type ExternalLinkInput = z.infer<typeof externalLinkInputSchema>

export type ExternalEntryStatus = { id: string; title: string; kind: "uri" | "sub"; count: number; error: string }
export type ExternalResolve = { uris: string[]; statuses: ExternalEntryStatus[] }

export function isNodeUri(value: string): boolean {
	const at = value.indexOf("://")
	if (at <= 0 || value.includes(" ")) return false
	return NODE_SCHEMES.includes(value.slice(0, at).toLowerCase())
}

function autoKind(value: string): "uri" | "sub" {
	const lower = value.trim().toLowerCase()
	return lower.startsWith("http://") || lower.startsWith("https://") ? "sub" : "uri"
}

function checkValue(kind: "uri" | "sub", raw: string): string {
	const value = raw.trim()
	if (kind === "uri") {
		if (!isNodeUri(value)) throw new AppError("\u0644\u06cc\u0646\u06a9 \u0646\u0648\u062f \u0646\u0627\u0645\u0639\u062a\u0628\u0631 \u0627\u0633\u062a")
		return value
	}
	const lower = value.toLowerCase()
	if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
		throw new AppError("\u0622\u062f\u0631\u0633 \u0627\u0634\u062a\u0631\u0627\u06a9 \u0628\u0627\u06cc\u062f \u0628\u0627 http \u06cc\u0627 https \u0628\u0627\u0634\u062f")
	}
	return value
}

/** a remote list is one URI per line, either plain text or base64 */
function urisFrom(text: string): string[] {
	const body = text.includes("://") ? text : decodeB64(text)
	const out: string[] = []
	for (const line of body.split("\n")) {
		const uri = line.trim()
		if (isNodeUri(uri)) out.push(uri)
	}
	return out
}

type CacheHit = { at: number; uris: string[]; error: string }
const cache = new Map<string, CacheHit>()

/**
 * The subscription endpoint is hot, so a remote list is cached for two minutes and a
 * failure for thirty seconds: one dead URL must not make every client wait.
 */
async function fetchSub(url: string): Promise<CacheHit> {
	const hit = cache.get(url)
	if (hit && Date.now() - hit.at < (hit.error ? FAIL_TTL_MS : OK_TTL_MS)) return hit
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
	let fresh: CacheHit
	try {
		const res = await fetch(url, {
			signal: controller.signal,
			redirect: "follow",
			headers: { "user-agent": "SR-Panel", accept: "text/plain, */*" },
		})
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		const uris = urisFrom((await res.text()).slice(0, BODY_LIMIT)).slice(0, MAX_PER_ENTRY)
		fresh = { at: Date.now(), uris, error: uris.length > 0 ? "" : "empty" }
	} catch (err) {
		fresh = { at: Date.now(), uris: [], error: err instanceof Error ? err.message : "fetch failed" }
	} finally {
		clearTimeout(timer)
	}
	cache.set(url, fresh)
	return fresh
}

export async function externalLinks(): Promise<ExternalLinkBook> {
	return getSetting(EXTERNAL_LINKS_KEY, externalLinksSchema)
}

function newId(): string {
	return `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export async function saveExternalLink(adminId: string | null, input: ExternalLinkInput): Promise<ExternalLink> {
	const book = await externalLinks()
	const kind = input.kind ?? autoKind(input.value)
	const entry: ExternalLink = {
		id: (input.id || "").trim() || newId(),
		enabled: input.enabled ?? true,
		title: (input.title || "").trim(),
		kind,
		value: checkValue(kind, input.value),
	}
	const known = book.entries.some((item) => item.id === entry.id)
	if (!known && book.entries.length >= MAX_ENTRIES) {
		throw new AppError("\u0633\u0642\u0641 \u0644\u06cc\u0646\u06a9\u200c\u0647\u0627\u06cc \u062e\u0627\u0631\u062c\u06cc \u067e\u0631 \u0634\u062f\u0647 \u0627\u0633\u062a")
	}
	const entries = known ? book.entries.map((item) => (item.id === entry.id ? entry : item)) : [...book.entries, entry]
	await setSetting(EXTERNAL_LINKS_KEY, externalLinksSchema, { entries })
	await audit(adminId, known ? "external_link.update" : "external_link.create", entry.id, { kind, title: entry.title })
	return entry
}

export async function deleteExternalLink(adminId: string | null, id: string): Promise<boolean> {
	const book = await externalLinks()
	const entries = book.entries.filter((item) => item.id !== id)
	if (entries.length === book.entries.length) return false
	await setSetting(EXTERNAL_LINKS_KEY, externalLinksSchema, { entries })
	await audit(adminId, "external_link.delete", id)
	return true
}

/** one entry, without saving it - the "test" button in the panel */
export async function probeExternalLink(input: { value: string; kind?: "uri" | "sub" }): Promise<{ ok: boolean; count: number; error: string }> {
	const kind = input.kind ?? autoKind(input.value)
	const value = checkValue(kind, input.value)
	if (kind === "uri") return { ok: true, count: 1, error: "" }
	const res = await fetchSub(value)
	return { ok: res.uris.length > 0, count: res.uris.length, error: res.error }
}

/** the extra URIs a subscription should carry on top of our own links */
export async function resolveExternalUris(): Promise<ExternalResolve> {
	const book = await externalLinks()
	const active = book.entries.filter((entry) => entry.enabled)
	const found = await Promise.all(
		active.map(async (entry) => {
			if (entry.kind === "uri") {
				return isNodeUri(entry.value) ? { uris: [entry.value], error: "" } : { uris: [] as string[], error: "invalid" }
			}
			const res = await fetchSub(entry.value)
			return { uris: res.uris, error: res.error }
		}),
	)
	const uris: string[] = []
	const statuses: ExternalEntryStatus[] = []
	const seen = new Set<string>()
	active.forEach((entry, index) => {
		const res = found[index] ?? { uris: [], error: "" }
		let count = 0
		for (const uri of res.uris) {
			if (seen.has(uri) || uris.length >= MAX_TOTAL) continue
			seen.add(uri)
			uris.push(uri)
			count += 1
		}
		statuses.push({ id: entry.id, title: entry.title, kind: entry.kind, count, error: res.error })
	})
	return { uris, statuses }
}
