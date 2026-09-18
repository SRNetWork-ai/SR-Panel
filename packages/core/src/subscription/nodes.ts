/**
 * Reading our own share URIs back into structured nodes.
 *
 * `subscription/links.ts` writes vless / vmess / trojan / ss URIs for the apps that
 * speak the v2ray "base64 list" dialect. Clash/Mihomo and sing-box want a whole config
 * file instead, so the only way to stay in sync with the inbound logic is to parse back
 * what we just wrote: if a link works in v2rayNG, the generated YAML and JSON describe
 * exactly the same tunnel.
 *
 * Nothing here touches the database or a panel - it is a pure string -> object
 * transform, which is also why it is safe to run on every subscription request.
 */

export type NodeKind = "vless" | "vmess" | "trojan" | "ss"

/** transports our links can carry; only the first four are portable (see isPortableNode) */
export type NodeNetwork = "tcp" | "ws" | "grpc" | "httpupgrade" | "h2" | "kcp" | "xhttp" | "splithttp"

export type ProxyNode = {
	kind: NodeKind
	name: string
	host: string
	port: number
	/** uuid for vless/vmess, password for trojan/ss */
	secret: string
	/** shadowsocks cipher, or the vmess `scy` value */
	method?: string
	network: NodeNetwork
	tls: "none" | "tls" | "reality"
	sni?: string
	alpn?: string[]
	fingerprint?: string
	insecure?: boolean
	flow?: string
	reality?: { publicKey: string; shortId?: string }
	path?: string
	hostHeader?: string
	serviceName?: string
	headerType?: string
	/** websocket early data length (`?ed=2048` inside the path) */
	earlyData?: number
}

/** a raw URI, or one of the `{ uri, remark }` rows a SubscriptionPayload carries */
export type ShareLink = string | { uri: string; remark?: string }

const PORTABLE_NETWORKS: readonly NodeNetwork[] = ["tcp", "ws", "grpc", "httpupgrade"]

/**
 * Can this node be expressed in Mihomo / sing-box without lying about it?
 * mKCP, xhttp and splithttp have no equivalent there, and neither does tcp + http
 * obfuscation - such nodes are skipped instead of emitted as a broken proxy.
 */
export function isPortableNode(node: ProxyNode): boolean {
	if (!PORTABLE_NETWORKS.includes(node.network)) return false
	if (node.network === "tcp" && node.headerType && node.headerType !== "none") return false
	return true
}

function decodeB64(raw: string): string {
	const clean = raw.trim().split("-").join("+").split("_").join("/")
	if (!clean) return ""
	const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4)
	try {
		return Buffer.from(padded, "base64").toString("utf8")
	} catch {
		return ""
	}
}

function tryDecode(value: string): string {
	if (!value) return ""
	try {
		return decodeURIComponent(value)
	} catch {
		return value
	}
}

/** IPv6 hosts arrive bracketed from `new URL`, but both config formats want them bare */
function normalizeHost(raw: string): string {
	const host = raw.trim()
	if (host.startsWith("[") && host.endsWith("]")) return host.slice(1, -1)
	return host
}

function pickInt(raw: string): number {
	const num = Number.parseInt(raw.trim(), 10)
	return Number.isFinite(num) && num > 0 ? Math.trunc(num) : 0
}

function pickPort(raw: string): number {
	const port = pickInt(raw)
	return port < 65536 ? port : 0
}

function truthy(raw: string | null): boolean {
	const value = (raw || "").trim().toLowerCase()
	return value === "1" || value === "true" || value === "yes"
}

function splitAlpn(raw: string | null): string[] | undefined {
	const parts = (raw || "")
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
	return parts.length > 0 ? parts : undefined
}

function networkOf(raw: string | null): NodeNetwork {
	const value = (raw || "").trim().toLowerCase()
	if (value === "ws" || value === "websocket") return "ws"
	if (value === "grpc" || value === "gun") return "grpc"
	if (value === "httpupgrade") return "httpupgrade"
	if (value === "h2" || value === "http") return "h2"
	if (value === "kcp" || value === "mkcp") return "kcp"
	if (value === "xhttp") return "xhttp"
	if (value === "splithttp") return "splithttp"
	return "tcp"
}

function tlsOf(raw: string | null): ProxyNode["tls"] {
	const value = (raw || "").trim().toLowerCase()
	if (value === "reality") return "reality"
	if (value === "tls" || value === "xtls") return "tls"
	return "none"
}

/** `/ws?ed=2048` -> path `/ws` plus 2048 bytes of websocket early data */
function splitPath(raw: string): { path: string; earlyData: number } {
	const value = raw.trim()
	const at = value.indexOf("?")
	if (at < 0) return { path: value, earlyData: 0 }
	let earlyData = 0
	for (const part of value.slice(at + 1).split("&")) {
		const eq = part.indexOf("=")
		const key = (eq < 0 ? part : part.slice(0, eq)).trim().toLowerCase()
		if (key === "ed") earlyData = pickInt(eq < 0 ? "" : part.slice(eq + 1))
	}
	return { path: value.slice(0, at), earlyData }
}

/** app-visible labels: drop control characters, keep it short, never empty */
function cleanName(raw: string, fallback: string): string {
	let out = ""
	for (const ch of raw) {
		const code = ch.codePointAt(0) || 0
		if (code < 32 || code === 127) continue
		out += ch
	}
	out = out.trim()
	if (!out) return fallback
	return out.length > 60 ? out.slice(0, 60).trim() : out
}

/** both formats key their proxy groups by name, so duplicates would silently vanish */
function uniqueName(raw: string, used: Set<string>): string {
	let name = raw
	let counter = 2
	while (used.has(name)) {
		name = `${raw} ${counter}`
		counter += 1
	}
	used.add(name)
	return name
}

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
	const flow = (q.get("