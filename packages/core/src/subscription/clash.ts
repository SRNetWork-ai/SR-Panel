import { isPortableNode, type ProxyNode } from "./nodes"

/**
 * Clash / Mihomo YAML.
 *
 * Emitted as plain lines instead of through a YAML library: the shape is fixed and
 * tiny, and a dependency-free renderer cannot reorder or reformat what the apps read.
 * Every scalar goes through JSON.stringify, which is also a valid YAML double-quoted
 * scalar, so a client name containing '#', ':' or emoji can never break the document.
 */

export type ClashOptions = {
	/** label of the select group the user picks in the app (usually the brand name) */
	group: string
	/** leading comment only */
	title?: string
	pageUrl?: string
}

const AUTO = "Auto"
const DIRECT = "DIRECT"
const TEST_URL = "http://www.gstatic.com/generate_204"

const RULES: readonly string[] = [
	"IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
	"IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
	"IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
	"IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
	"DOMAIN-SUFFIX,ir,DIRECT",
	"GEOIP,IR,DIRECT",
]

const VMESS_CIPHERS: readonly string[] = ["auto", "none", "zero", "aes-128-gcm", "chacha20-poly1305"]

function q(value: string): string {
	return JSON.stringify(value)
}

/** group names travel inside comma-separated rules, so ',' and '"' have to go */
function safeName(raw: string, fallback: string): string {
	let out = ""
	for (const ch of raw) {
		const code = ch.codePointAt(0) || 0
		if (code < 32 || code === 34 || code === 44 || code === 127) continue
		out += ch
	}
	out = out.trim()
	return out || fallback
}

function vmessCipher(raw: string | undefined): string {
	const value = (raw || "").trim().toLowerCase()
	return VMESS_CIPHERS.includes(value) ? value : "auto"
}

function proxyLines(node: ProxyNode): string[] {
	const lines: string[] = []
	const add = (depth: number, text: string): void => {
		lines.push("  ".repeat(depth) + text)
	}
	add(1, `- name: ${q(node.name)}`)
	add(2, `type: ${node.kind}`)
	add(2, `server: ${q(node.host)}`)
	add(2, `port: ${node.port}`)
	add(2, "udp: true")
	if (node.kind === "vless") {
		add(2, `uuid: ${q(node.secret)}`)
		if (node.flow) add(2, `flow: ${q(node.flow)}`)
	} else if (node.kind === "vmess") {
		add(2, `uuid: ${q(node.secret)}`)
		add(2, "alterId: 0")
		add(2, `cipher: ${q(vmessCipher(node.method))}`)
	} else if (node.kind === "trojan") {
		add(2, `password: ${q(node.secret)}`)
	} else {
		add(2, `cipher: ${q(node.method || "aes-256-gcm")}`)
		add(2, `password: ${q(node.secret)}`)
		// shadowsocks here is always plain tcp: no tls block, no transport
		return lines
	}
	if (node.tls !== "none") {
		add(2, "tls: true")
		// trojan is the odd one out: Mihomo reads its server name from `sni`
		add(2, `${node.kind === "trojan" ? "sni" : "servername"}: ${q(node.sni || node.hostHeader || node.host)}`)
		if (node.alpn && node.alpn.length > 0) {
			add(2, "alpn:")
			for (const item of node.alpn) add(3, `- ${q(item)}`)
		}
		add(2, `client-fingerprint: ${q(node.fingerprint || "chrome")}`)
		if (node.insecure) add(2, "skip-cert-verify: true")
		if (node.tls === "reality" && node.reality) {
			add(2, "reality-opts:")
			add(3, `public-key: ${q(node.reality.publicKey)}`)
			if (node.reality.shortId) add(3, `short-id: ${q(node.reality.shortId)}`)
		}
	}
	if (node.network === "ws" || node.network === "httpupgrade") {
		add(2, "network: ws")
		add(2, "ws-opts:")
		add(3, `path: ${q(node.path || "/")}`)
		if (node.hostHeader) {
			add(3, "headers:")
			add(4, `Host: ${q(node.hostHeader)}`)
		}
		if (node.network === "httpupgrade") {
			// Mihomo has no separate httpupgrade transport: it is a websocket flag
			add(3, "v2ray-http-upgrade: true")
		} else if (node.earlyData) {
			add(3, `max-early-data: ${node.earlyData}`)
			add(3, `early-data-header-name: ${q("Sec-WebSocket-Protocol")}`)
		}
	} else if (node.network === "grpc") {
		add(2, "network: grpc")
		add(2, "grpc-opts:")
		add(3, `grpc-service-name: ${q(node.serviceName || "")}`)
	}
	return lines
}

export function toClashConfig(nodes: readonly ProxyNode[], opts: ClashOptions): string {
	const usable = nodes.filter((node) => isPortableNode(node))
	const names = usable.map((node) => node.name)
	let group = safeName(opts.group, "SR-Panel")
	// the group shares one namespace with the proxies it contains
	while (names.includes(group) || group === AUTO || group === DIRECT) group = `${group} +`
	const lines: string[] = [`# ${safeName(opts.title || group, group)} (Clash / Mihomo)`]
	if (opts.pageUrl) lines.push(`# ${opts.pageUrl}`)
	lines.push("mixed-port: 7890", "allow-lan: false", "mode: rule", "log-level: warning", "ipv6: false")
	lines.push("dns:", "  enable: true", "  ipv6: false", "  enhanced-mode: fake-ip", "  fake-ip-range: 198.18.0.1/16", "  nameserver:")
	lines.push(`    - ${q("1.1.1.1")}`, `    - ${q("8.8.8.8")}`)
	lines.push(usable.length > 0 ? "proxies:" : "proxies: []")
	for (const node of usable) for (const line of proxyLines(node)) lines.push(line)
	lines.push("proxy-groups:", `  - name: ${q(group)}`, "    type: select", "    proxies:")
	if (usable.length > 0) lines.push(`      - ${q(AUTO)}`)
	for (const name of names) lines.push(`      - ${q(name)}`)
	lines.push(`      - ${q(DIRECT)}`)
	if (usable.length > 0) {
		lines.push(`  - name: ${q(AUTO)}`, "    type: url-test", `    url: ${q(TEST_URL)}`, "    interval: 300", "    tolerance: 50", "    proxies:")
		for (const name of names) lines.push(`      - ${q(name)}`)
	}
	lines.push("rules:")
	for (const rule of RULES) lines.push(`  - ${q(rule)}`)
	lines.push(`  - ${q(`MATCH,${group}`)}`)
	return lines.join("\n") + "\n"
}
