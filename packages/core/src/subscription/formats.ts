import { toClashConfig } from "./clash"
import type { ShareLink } from "./nodes"
import { parseShareUris } from "./nodeUris"
import { toSingboxConfig } from "./singbox"

/**
 * One place that decides *which dialect* a subscription request gets.
 *
 * The URL never changes: the same /sub/<token> answers v2rayNG with base64, Mihomo
 * with YAML and sing-box with JSON, either from an explicit ?format= or from the
 * client's User-Agent. Keeping the decision here (instead of in the route) lets the
 * storefront page, the bots and any future endpoint offer the same links without
 * duplicating the needle lists.
 */

export const SUB_FORMATS = ["base64", "links", "clash", "singbox"] as const

export type SubFormat = (typeof SUB_FORMATS)[number]

export type RenderSubscriptionInput = {
	links: readonly ShareLink[]
	/** the ready-made base64 body from buildSubscription */
	base64: string
	/** non-dialable "quota / expiry" pseudo config: base64 and links only */
	infoUri?: string | null
	title?: string
	group?: string
	pageUrl?: string
}

export type RenderedSubscription = {
	format: SubFormat
	body: string
	contentType: string
	extension: string
}

const CLASH_AGENTS: readonly string[] = ["clash", "mihomo", "clash-meta", "stash", "flclash"]
const SINGBOX_AGENTS: readonly string[] = ["sing-box", "singbox", "sfa", "sfi", "sfm", "karing", "husi", "puernya"]
const TEXT = "text/plain; charset=utf-8"

export function detectSubFormat(userAgent?: string | null, explicit?: string | null): SubFormat {
	const want = (explicit || "").trim().toLowerCase()
	if (want) {
		if (want === "clash" || want === "mihomo" || want === "meta" || want === "clashmeta" || want === "yaml") return "clash"
		if (want === "singbox" || want === "sing-box" || want === "sfa" || want === "json") return "singbox"
		if (want === "links" || want === "uri" || want === "text" || want === "plain") return "links"
		return "base64"
	}
	const agent = (userAgent || "").trim().toLowerCase()
	if (!agent) return "base64"
	for (const needle of CLASH_AGENTS) if (agent.includes(needle)) return "clash"
	for (const needle of SINGBOX_AGENTS) if (agent.includes(needle)) return "singbox"
	return "base64"
}

function groupOf(input: RenderSubscriptionInput): string {
	const group = (input.group || "").trim()
	if (group) return group
	const title = (input.title || "").trim()
	return title || "SR-Panel"
}

function uriList(input: RenderSubscriptionInput): string[] {
	const uris: string[] = []
	if (input.infoUri) uris.push(input.infoUri)
	for (const link of input.links) {
		const uri = (typeof link === "string" ? link : link.uri || "").trim()
		if (uri) uris.push(uri)
	}
	return uris
}

export function renderSubscription(format: SubFormat, input: RenderSubscriptionInput): RenderedSubscription {
	// the info pseudo config is not dialable, so it stays out of the full configs:
	// inside a proxy group it would be picked by url-test and break the connection
	if (format === "clash") {
		const body = toClashConfig(parseShareUris(input.links), {
			group: groupOf(input),
			title: input.title,
			pageUrl: input.pageUrl,
		})
		return { format, body, contentType: "text/yaml; charset=utf-8", extension: "yaml" }
	}
	if (format === "singbox") {
		const body = toSingboxConfig(parseShareUris(input.links), { group: groupOf(input) })
		return { format, body, contentType: "application/json; charset=utf-8", extension: "json" }
	}
	if (format === "links") {
		return { format, body: uriList(input).join("\n") + "\n", contentType: TEXT, extension: "txt" }
	}
	return { format: "base64", body: input.base64, contentType: TEXT, extension: "txt" }
}
