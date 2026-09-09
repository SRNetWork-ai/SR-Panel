import type { PanelInbound } from "../panels/types"

export type StoredInbound = Omit<PanelInbound, "clientStats"> & { clientStats?: PanelInbound["clientStats"] }

export interface LinkClient {
	uuid: string
	email: string
	/** VLESS flow override; when undefined we read it from the inbound's stored client entry */
	flow?: string
}

export interface LinkOptions {
	/** Public host of the server (IP or domain) */
	host: string
	/** Display name in the client app */
	remark: string
}

interface Endpoint {
	host: string
	port: number
	security: string
	remark: string
}

function streamQuery(ss: Record<string, any>) {
	const network = String(ss.network || "tcp")
	const security = String(ss.security || "none")
	const q: Record<string, string> = { type: network, security }
	if (security === "tls") {
		const tls = ss.tlsSettings ?? {}
		const s = tls.settings ?? {}
		if (tls.serverName) q.sni = String(tls.serverName)
		if (s.fingerprint) q.fp = String(s.fingerprint)
		if (Array.isArray(tls.alpn) && tls.alpn.length) q.alpn = tls.alpn.join(",")
		if (s.allowInsecure) q.allowInsecure = "1"
	} else if (security === "reality") {
		const r = ss.realitySettings ?? {}
		const s = r.settings ?? {}
		if (Array.isArray(r.serverNames) && r.serverNames[0]) q.sni = String(r.serverNames[0])
		if (s.fingerprint) q.fp = String(s.fingerprint)
		if (s.publicKey) q.pbk = String(s.publicKey)
		if (Array.isArray(r.shortIds) && r.shortIds[0] !== undefined) q.sid = String(r.shortIds[0])
		if (s.spiderX) q.spx = String(s.spiderX)
	}
	switch (network) {
		case "ws": {
			const w = ss.wsSettings ?? {}
			if (w.path) q.path = String(w.path)
			const h = w.host || w.headers?.Host
			if (h) q.host = String(h)
			break
		}
		case "httpupgrade": {
			const w = ss.httpupgradeSettings ?? {}
			if (w.path) q.path = String(w.path)
			if (w.host) q.host = String(w.host)
			break
		}
		case "xhttp":
		case "splithttp": {
			const w = ss.xhttpSettings ?? ss.splithttpSettings ?? {}
			if (w.path) q.path = String(w.path)
			if (w.host) q.host = String(w.host)
			if (w.mode) q.mode = String(w.mode)
			break
		}
		case "grpc": {
			const g = ss.grpcSettings ?? {}
			if (g.serviceName) q.serviceName = String(g.serviceName)
			if (g.authority) q.authority = String(g.authority)
			if (g.multiMode) q.mode = "multi"
			break
		}
		case "kcp": {
			const k = ss.kcpSettings ?? {}
			q.headerType = String(k.header?.type || "none")
			if (k.seed) q.seed = String(k.seed)
			break
		}
		case "tcp":
		default: {
			const t = ss.tcpSettings ?? {}
			if (t.header?.type === "http") {
				q.headerType = "http"
				const req = t.header.request ?? {}
				if (Array.isArray(req.path) && req.path[0]) q.path = String(req.path[0])
				const hosts = req.headers?.Host
				if (Array.isArray(hosts) && hosts[0]) q.host = String(hosts[0])
			}
		}
	}
	return { network, security, q }
}

function endpoints(inbound: StoredInbound, security: string, opts: LinkOptions): Endpoint[] {
	const ext = inbound.streamSettings?.externalProxy
	if (Array.isArray(ext) && ext.length) {
		return ext.map((p: any) => {
			const force = String(p.forceTls || "same")
			return {
				host: String(p.dest),
				port: Number(p.port) || inbound.port,
				security: force === "same" ? security : force,
				remark: p.remark ? `${opts.remark} ${p.remark}` : opts.remark,
			}
		})
	}
	return [{ host: opts.host, port: inbound.port, security, remark: opts.remark }]
}

function b64(s: string) {
	return Buffer.from(s, "utf8").toString("base64")
}

/** Resolve the VLESS flow stored on the inbound for this client (falls back to a sane default). */
export function resolveFlow(inbound: StoredInbound, uuid: string, override?: string): string {
	if (override !== undefined) return override
	const clients: any[] = Array.isArray(inbound.settings?.clients) ? inbound.settings.clients : []
	const mine = clients.find((c) => c?.id === uuid)
	if (mine && typeof mine.flow === "string") return mine.flow
	const first = clients.find((c) => typeof c?.flow === "string")
	if (first) return first.flow
	const ss = inbound.streamSettings ?? {}
	if (inbound.protocol === "vless" && ss.security === "reality" && (ss.network || "tcp") === "tcp") return "xtls-rprx-vision"
	return ""
}

/** Build share links (vless:// vmess:// trojan:// ss://) for one client on one inbound. */
export function buildLinks(inbound: StoredInbound, client: LinkClient, opts: LinkOptions): string[] {
	const { network, security, q } = streamQuery(inbound.streamSettings ?? {})
	const eps = endpoints(inbound, security, opts)
	const links: string[] = []
	for (const ep of eps) {
		const params = new URLSearchParams({ ...q, security: ep.security })
		if (ep.security === "none") params.delete("sni"), params.delete("fp"), params.delete("alpn")
		const hash = `#${encodeURIComponent(ep.remark)}`
		switch (inbound.protocol) {
			case "vmess": {
				const obj = {
					v: "2",
					ps: ep.remark,
					add: ep.host,
					port: String(ep.port),
					id: client.uuid,
					aid: "0",
					scy: "auto",
					net: network,
					type: q.headerType ?? "none",
					host: q.host ?? "",
					path: q.path ?? (network === "grpc" ? q.serviceName ?? "" : ""),
					tls: ep.security === "tls" ? "tls" : "",
					sni: q.sni ?? "",
					fp: q.fp ?? "",
					alpn: q.alpn ?? "",
				}
				links.push(`vmess://${b64(JSON.stringify(obj))}`)
				break
			}
			case "trojan":
				links.push(`trojan://${client.uuid}@${ep.host}:${ep.port}?${params.toString()}${hash}`)
				break
			case "shadowsocks": {
				const method = String(inbound.settings?.method || "aes-256-gcm")
				const clientPwd = client.uuid.replace(/-/g, "")
				const serverPwd = String(inbound.settings?.password || "")
				const pwd = method.startsWith("2022-blake3") && serverPwd ? `${serverPwd}:${clientPwd}` : clientPwd
				links.push(`ss://${b64(`${method}:${pwd}`)}@${ep.host}:${ep.port}${hash}`)
				break
			}
			case "vless":
			default: {
				const flow = resolveFlow(inbound, client.uuid, client.flow)
				if (flow) params.set("flow", flow)
				params.set("encryption", "none")
				links.push(`vless://${client.uuid}@${ep.host}:${ep.port}?${params.toString()}${hash}`)
			}
		}
	}
	return links
}

export interface SubscriptionInfo {
	upload: number
	download: number
	total: number
	/** unix seconds, 0 = never */
	expire: number
}

/** Standard `subscription-userinfo` header value understood by v2rayNG, Hiddify, Streisand, Happ, ... */
export function userInfoHeader(i: SubscriptionInfo): string {
	const parts = [`upload=${Math.max(0, Math.round(i.upload))}`, `download=${Math.max(0, Math.round(i.download))}`]
	if (i.total > 0) parts.push(`total=${Math.round(i.total)}`)
	if (i.expire > 0) parts.push(`expire=${Math.round(i.expire)}`)
	return parts.join("; ")
}
