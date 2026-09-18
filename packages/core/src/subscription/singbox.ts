import { isPortableNode, type ProxyNode } from "./nodes"

/**
 * sing-box JSON (SFA / SFI / SFM / Karing / Husi ...).
 *
 * Deliberately a version-stable subset: no `dns` block and no `tun` inbound, because
 * every GUI adds its own and a stale schema there is the classic "config parse error"
 * on import. We only ship the part that is ours to know - the outbounds - plus a
 * minimal selector / urltest pair so the user can pick a server inside the app.
 */

export type SingboxOptions = {
	/** label of the selector the user picks in the app (usually the brand name) */
	group: string
}

const AUTO = "Auto"
const DIRECT = "direct"
const TEST_URL = "http://www.gstatic.com/generate_204"
const VMESS_SECURITY: readonly string[] = ["auto", "none", "zero", "aes-128-gcm", "chacha20-poly1305"]

function safeTag(raw: string, fallback: string): string {
	let out = ""
	for (const ch of raw) {
		const code = ch.codePointAt(0) || 0
		if (code < 32 || code === 127) continue
		out += ch
	}
	out = out.trim()
	return out || fallback
}

function tlsOf(node: ProxyNode): Record<string, unknown> | undefined {
	if (node.tls === "none") return undefined
	const tls: Record<string, unknown> = { enabled: true, server_name: node.sni || node.hostHeader || node.host }
	if (node.insecure) tls.insecure = true
	if (node.alpn && node.alpn.length > 0) tls.alpn = node.alpn
	if (node.fingerprint) tls.utls = { enabled: true, fingerprint: node.fingerprint }
	if (node.tls === "reality" && node.reality) {
		const reality: Record<string, unknown> = { enabled: true, public_key: node.reality.publicKey }
		if (node.reality.shortId) reality.short_id = node.reality.shortId
		tls.reality = reality
		// reality without uTLS is rejected outright
		if (!tls.utls) tls.utls = { enabled: true, fingerprint: "chrome" }
	}
	return tls
}

function transportOf(node: ProxyNode): Record<string, unknown> | undefined {
	if (node.network === "ws") {
		const transport: Record<string, unknown> = { type: "ws", path: node.path || "/" }
		if (node.hostHeader) transport.headers = { Host: node.hostHeader }
		if (node.earlyData) {
			transport.max_early_data = node.earlyData
			transport.early_data_header_name = "Sec-WebSocket-Protocol"
		}
		return transport
	}
	if (node.network === "httpupgrade") {
		const transport: Record<string, unknown> = { type: "httpupgrade", path: node.path || "/" }
		if (node.hostHeader) transport.host = node.hostHeader
		return transport
	}
	if (node.network === "grpc") return { type: "grpc", service_name: node.serviceName || "" }
	return undefined
}

function outboundOf(node: ProxyNode): Record<string, unknown> {
	const out: Record<string, unknown> = { type: node.kind, tag: node.name, server: node.host, server_port: node.port }
	if (node.kind === "vless") {
		out.uuid = node.secret
		if (node.flow) out.flow = node.flow
		out.packet_encoding = "xudp"
	} else if (node.kind === "vmess") {
		out.uuid = node.secret
		const security = (node.method || "").trim().toLowerCase()
		out.security = VMESS_SECURITY.includes(security) ? security : "auto"
		out.alter_id = 0
	} else if (node.kind === "trojan") {
		out.password = node.secret
	} else {
		out.type = "shadowsocks"
		out.method = node.method || "aes-256-gcm"
		out.password = node.secret
		return out
	}
	const tls = tlsOf(node)
	if (tls) out.tls = tls
	const transport = transportOf(node)
	if (transport) out.transport = transport
	return out
}

export function toSingboxConfig(nodes: readonly ProxyNode[], opts: SingboxOptions): string {
	const usable = nodes.filter((node) => isPortableNode(node))
	const tags = usable.map((node) => node.name)
	let group = safeTag(opts.group, "SR-Panel")
	// outbound tags are one namespace: the selector may not collide with a node
	while (tags.includes(group) || group === AUTO || group === DIRECT) group = `${group} +`
	const outbounds: Record<string, unknown>[] = usable.map((node) => outboundOf(node))
	if (tags.length > 0) {
		outbounds.push({ type: "urltest", tag: AUTO, outbounds: tags, url: TEST_URL, interval: "5m", tolerance: 50 })
	}
	outbounds.push({
		type: "selector",
		tag: group,
		outbounds: tags.length > 0 ? [AUTO, ...tags, DIRECT] : [DIRECT],
		default: tags.length > 0 ? AUTO : DIRECT,
	})
	outbounds.push({ type: DIRECT, tag: DIRECT })
	const config = {
		log: { level: "warn", timestamp: true },
		inbounds: [{ type: "mixed", tag: "mixed-in", listen: "127.0.0.1", listen_port: 2080 }],
		outbounds,
		route: {
			rules: [{ ip_is_private: true, outbound: DIRECT }],
			final: group,
			auto_detect_interface: true,
		},
	}
	return JSON.stringify(config, null, 2) + "\n"
}
