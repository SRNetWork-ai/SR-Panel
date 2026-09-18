import {
	cleanName,
	decodeB64,
	networkOf,
	normalizeHost,
	pickPort,
	splitAlpn,
	splitPath,
	tlsOf,
	truthy,
	tryDecode,
	uniqueName,
	type ProxyNode,
	type ShareLink,
} from "./nodes"

/**
 * Share URI -> ProxyNode.
 *
 * Only the four schemes `subscription/links.ts` can produce are understood; anything
 * else (or anything malformed) yields null and is skipped by the callers, so a single
 * odd inbound can never break a whole generated config.
 */

function parseUrlLike(kind: "vless" | "trojan", raw: string, fallbackName: string): ProxyNode | null {
	let url: URL
	try {
		url = new URL(raw)
	} catch {
		return null
	}
	const host = normalizeHost(url.hostname)
	const port = pickPort(url.port)
	const secret = tryDecode(url.username)
	if (!host || !port || !secret) return null
	// searchParams already percent-decodes every value, so no second decode here
	const q = url.searchParams
	const node: ProxyNode = {
		kind,
		name: cleanName(tryDecode(url.hash.slice(1)), fallbackName),
		host,
		port,
		secret,
		network: networkOf(q.get("type")),
		tls: tlsOf(q.get("security")),
	}
	const sni = (q.get("sni") || "").trim()
	if (sni) node.sni = sni
	const alpn = splitAlpn(q.get("alpn"))
	if (alpn) node.alpn = alpn
	const fingerprint = (q.get("fp") || "").trim()
	if (fingerprint) node.fingerprint = fingerprint
	if (truthy(q.get("allowInsecure")) || truthy(q.get("insecure"))) node.insecure = true
	const flow = (q.get("flow") || "").trim()
	if (flow) node.flow = flow
	const publicKey = (q.get("pbk") || "").trim()
	if (node.tls === "reality" && publicKey) {
		const shortId = (q.get("sid") || "").trim()
		node.reality = shortId ? { publicKey, shortId } : { publicKey }
	}
	const { path, earlyData } = splitPath(q.get("path") || "")
	if (path) node.path = path
	if (earlyData) node.earlyData = earlyData
	const hostHeader = (q.get("host") || "").trim()
	if (hostHeader) node.hostHeader = hostHeader
	const serviceName = (q.get("serviceName") || "").trim()
	if (serviceName) node.serviceName = serviceName
	const headerType = (q.get("headerType") || "").trim()
	if (headerType && headerType !== "none") node.headerType = headerType
	return node
}

function parseVmess(raw: string, fallbackName: string): ProxyNode | null {
	const body = raw.slice(raw.indexOf("://") + 3)
	const hash = body.indexOf("#")
	const text = decodeB64(hash < 0 ? body : body.slice(0, hash))
	if (!text.startsWith("{")) return null
	let json: Record<string, unknown>
	try {
		json = JSON.parse(text) as Record<string, unknown>
	} catch {
		return null
	}
	// every field of the vmess JSON is written as a string by some client and as a number by another
	const str = (key: string): string => {
		const value = json[key]
		if (typeof value === "string") return value.trim()
		if (typeof value === "number") return String(value)
		return ""
	}
	const host = normalizeHost(str("add"))
	const port = pickPort(str("port"))
	const secret = str("id")
	if (!host || !port || !secret) return null
	const network = networkOf(str("net"))
	const node: ProxyNode = {
		kind: "vmess",
		name: cleanName(str("ps") || (hash < 0 ? "" : tryDecode(body.slice(hash + 1))), fallbackName),
		host,
		port,
		secret,
		network,
		tls: tlsOf(str("tls")),
	}
	const method = str("scy")
	if (method) node.method = method
	const sni = str("sni")
	if (sni) node.sni = sni
	const alpn = splitAlpn(str("alpn"))
	if (alpn) node.alpn = alpn
	const fingerprint = str("fp")
	if (fingerprint) node.fingerprint = fingerprint
	const hostHeader = str("host")
	if (hostHeader) node.hostHeader = hostHeader
	const headerType = str("type")
	if (headerType && headerType !== "none") node.headerType = headerType
	if (network === "grpc") {
		// the vmess JSON has no grpc field of its own: clients reuse `path` as the service name
		const serviceName = str("path")
		if (serviceName) node.serviceName = serviceName
	} else {
		const { path, earlyData } = splitPath(str("path"))
		if (path) node.path = path
		if (earlyData) node.earlyData = earlyData
	}
	return node
}

function ssNode(creds: string, hostPort: string, name: string): ProxyNode | null {
	const sep = creds.indexOf(":")
	if (sep <= 0) return null
	const method = creds.slice(0, sep).trim()
	const password = creds.slice(sep + 1)
	const cut = hostPort.lastIndexOf(":")
	if (cut <= 0) return null
	const host = normalizeHost(hostPort.slice(0, cut))
	const port = pickPort(hostPort.slice(cut + 1))
	if (!host || !port || !method || !password) return null
	return { kind: "ss", name, host, port, secret: password, method, network: "tcp", tls: "none" }
}

function parseSs(raw: string, fallbackName: string): ProxyNode | null {
	const body = raw.slice(raw.indexOf("://") + 3)
	const hash = body.indexOf("#")
	const name = cleanName(hash < 0 ? "" : tryDecode(body.slice(hash + 1)), fallbackName)
	const main = hash < 0 ? body : body.slice(0, hash)
	const query = main.indexOf("?")
	// obfs / v2ray-plugin has no representation here, and a silently dropped plugin is a dead node
	if (query >= 0 && main.slice(query + 1).toLowerCase().includes("plugin")) return null
	const core = query < 0 ? main : main.slice(0, query)
	const at = core.lastIndexOf("@")
	if (at > 0) {
		const head = core.slice(0, at)
		// base64 has no ':', so a colon means the credentials are already plain (SIP002)
		const creds = head.includes(":") ? tryDecode(head) : decodeB64(head)
		return ssNode(creds, tryDecode(core.slice(at + 1)), name)
	}
	const decoded = decodeB64(core)
	const split = decoded.lastIndexOf("@")
	if (split <= 0) return null
	return ssNode(decoded.slice(0, split), decoded.slice(split + 1), name)
}

export function parseShareUri(link: ShareLink, fallbackName = "node"): ProxyNode | null {
	if (!link) return null
	const raw = (typeof link === "string" ? link : link.uri || "").trim()
	const at = raw.indexOf("://")
	if (at <= 0) return null
	const remark = typeof link === "string" ? "" : (link.remark || "").trim()
	const name = cleanName(remark, fallbackName)
	const scheme = raw.slice(0, at).toLowerCase()
	if (scheme === "vless" || scheme === "trojan") return parseUrlLike(scheme, raw, name)
	if (scheme === "vmess") return parseVmess(raw, name)
	if (scheme === "ss") return parseSs(raw, name)
	return null
}

/** parses a whole subscription, keeping the input order and making every name unique */
export function parseShareUris(links: readonly ShareLink[], fallbackPrefix = "node"): ProxyNode[] {
	const nodes: ProxyNode[] = []
	const used = new Set<string>()
	let index = 0
	for (const link of links) {
		index += 1
		const node = parseShareUri(link, `${fallbackPrefix} ${index}`)
		if (!node) continue
		node.name = uniqueName(node.name, used)
		nodes.push(node)
	}
	return nodes
}
