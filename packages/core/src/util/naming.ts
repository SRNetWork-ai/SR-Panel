/**
 * Naming of a client on the remote panel.
 *
 * Operators expect the config inside 3x-ui to carry the exact name they typed
 * (previously we generated `${slug}-${shortId}`), optionally prefixed with a
 * short "tag" so every config of one customer is grouped visually.
 */
import { createHash } from "node:crypto"

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
