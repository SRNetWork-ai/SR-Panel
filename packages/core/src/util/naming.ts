/**
 * Naming of a client on the remote panel.
 *
 * Operators expect the config inside 3x-ui to carry the exact name they typed
 * (previously we generated `${slug}-${shortId}`), optionally prefixed with a
 * short "tag" so every config of one customer is grouped visually.
 */
import { createHash, randomBytes } from "node:crypto"

/** Characters that would break the panel payload / share links. Everything else (incl. Persian) is kept. */
const UNSAFE = /["'`\\<>{}\u0000-\u001f\u007f]/g

/** The typed name, trimmed and stripped of payload-breaking characters only. */
export function sanitizeConfigName(name: string | null | undefined, fallback = "client"): string {
	const clean = String(name ?? "")
		.replace(UNSAFE, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 64)
	return clean || fallback
}

/** Unambiguous lowercase alphabet: no l/1/i/o/0 so a handle can be read out loud. */
const HANDLE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"

/**
 * A random, panel-safe config name such as `srp-7k2mx94a`.
 *
 * Storefront orders must not inherit whatever the buyer typed in the name field — one
 * test order was enough to name every config «تست» — so fulfilment always generates a
 * fresh handle instead. `prefix` is reduced to ASCII letters/digits and may be empty.
 */
export function randomConfigName(prefix: string | null = "srp", length = 8): string {
	const size = Math.max(4, Math.min(24, Math.round(length)))
	const base = String(prefix ?? "")
		.replace(/[^A-Za-z0-9]/g, "")
		.slice(0, 12)
		.toLowerCase()
	const bytes = randomBytes(size)
	let id = ""
	for (let i = 0; i < size; i++) id += HANDLE_ALPHABET[(bytes[i] ?? 0) % HANDLE_ALPHABET.length]
	return base ? `${base}-${id}` : id
}

/**
 * Final config name = `<tag>-<name>`.
 * A tag that already ends with punctuation keeps its own separator, so "VIP|" -> "VIP|name".
 */
export function configLabel(client: { name: string; tag?: string | null }): string {
	const name = sanitizeConfigName(client.name)
	const tag = sanitizeConfigName(client.tag, "")
	if (!tag) return name
	return /[\p{L}\p{N}]$/u.test(tag) ? `${tag}-${name}` : `${tag}${name}`
}

/**
 * 3x-ui keeps one subId per client row and refuses duplicates
 * (`Something went wrong (subId already in use: ...)`), so two configs living on the
 * same panel must not share one. A client attached to several inbounds is a single
 * config and therefore keyed by the first inbound of that group.
 * Derived - never stored - so create and update always agree.
 * `salt` is only used when the panel still reports a collision.
 */
export function remoteSubId(subToken: string, serverId: string, inboundId: number, salt = ""): string {
	const digest = createHash("sha1").update(`${subToken}:${serverId}:${inboundId}:${salt}`).digest("hex")
	return `${subToken.slice(0, 8)}${digest.slice(0, 8)}`
}
