/**
 * Address resolution for generated configs.
 *
 * `Server.baseUrl` is only the *management* endpoint of the 3x-ui panel, it is almost
 * never the address a client should dial. Every inbound can carry its own address
 * (external proxy, node share address, TLS certificate domain, CDN host, ...), so a
 * share link has to be built from the inbound first and from the server/panel only as
 * a fallback.
 *
 * Priority - first match wins:
 *   1. `streamSettings.externalProxy[].dest` - resolved per endpoint in `links.ts`
 *   2. `shareAddr`      - explicit share address of the inbound (3X-UI v3)
 *   3. `nodeAddress`    - address of the remote node hosting the inbound
 *   4. `listen`         - only when it is a public, routable address
 *   5. `tlsSettings.serverName` - TLS inbounds: the certificate domain
 *   6. transport host of a TLS inbound (ws / httpupgrade / xhttp / grpc authority)
 *   7. `Server.publicHost` - manual per-server override
 *   8. transport host of a plain `security=none` inbound (usually a CDN domain)
 *   9. public IP reported by the panel status endpoint
 *  10. hostname of the panel URL - last resort only
 *
 * Reality's `serverNames` / `dest` are camouflage values that point at a third party
 * website, so they are never used as an address.
 *
 * Set `SRP_SUB_PREFER_SERVER_HOST=1` to restore the old behaviour where the
 * server-level host always wins over the data stored on the inbound.
 */

export type InboundAddressSource =
	| "external-proxy"
	| "share-addr"
	| "node-address"
	| "listen"
	| "sni"
	| "transport-host"
	| "server-public-host"
	| "panel-ip"
	| "panel-url"
	| "unknown"

export interface ResolvedInboundAddress {
	host: string
	source: InboundAddressSource
}

export interface InboundAddressContext {
	/** `Server.publicHost` - manual per-server override */
	publicHost?: string | null
	/** `Server.baseUrl` - panel URL, used as a last resort */
	baseUrl?: string | null
	/** `Server.statusJson.publicIp` - string or `{ ipv4, ipv6 }` depending on the panel build */
	publicIp?: unknown
	/** When true the server host wins over every address stored on the inbound */
	preferServerHost?: boolean
}

/** Minimal shape needed to resolve an address (a stored inbound satisfies it). */
export interface AddressableInbound {
	listen?: string | null
	protocol?: string
	streamSettings?: Record<string, any> | null
	shareAddr?: string | null
	nodeAddress?: string | null
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const PRIVATE_SUFFIX = /\.(local|lan|internal|intranet|localdomain|invalid|test|example|arpa)$/

/** Reduces a stored value to a bare hostname/IP: drops scheme, path, port, brackets and list separators. */
export function normalizeHostValue(value: unknown): string {
	if (typeof value !== "string") return ""
	let host = value.trim()
	if (!host) return ""
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) {
		try {
			host = new URL(host).hostname
		} catch {
			return ""
		}
	}
	host = (host.split(/[,\s;|]/)[0] ?? "").replace(/^\/+/, "")
	const slash = host.indexOf("/")
	if (slash > 0) host = host.slice(0, slash)
	if (host.startsWith("[")) {
		const end = host.indexOf("]")
		host = end > 1 ? host.slice(1, end) : host.slice(1)
	} else if ((host.match(/:/g) ?? []).length === 1) {
		host = host.split(":")[0] ?? ""
	}
	host = host.replace(/\.+$/, "").toLowerCase()
	// a wildcard certificate name is not something a client can connect to
	if (!host || host === "*" || host.startsWith("*.")) return ""
	return host
}

function isPrivateV4(host: string): boolean {
	const m = IPV4.exec(host)
	if (!m) return false
	const a = Number(m[1])
	const b = Number(m[2])
	if (a === 0 || a === 10 || a === 127 || a === 255 || a >= 224) return true
	if (a === 169 && b === 254) return true
	if (a === 172 && b >= 16 && b <= 31) return true
	if (a === 192 && b === 168) return true
	if (a === 100 && b >= 64 && b <= 127) return true
	return false
}

/** True when clients can actually dial this value over the public internet. */
export function isRoutableAddress(value: unknown): boolean {
	const host = normalizeHostValue(value)
	if (!host) return false
	if (host === "localhost" || host.endsWith(".localhost")) return false
	if (IPV4.test(host)) return !isPrivateV4(host)
	if (host.includes(":")) {
		if (host === "::" || host === "::0" || host === "::1") return false
		if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return false
		return true
	}
	if (!host.includes(".")) return false
	return !PRIVATE_SUFFIX.test(host)
}

/** Domain carried by the transport layer (CDN host / grpc authority). `tcp+http` headers are camouflage. */
function transportHostOf(ss: Record<string, any>): string {
	switch (String(ss.network || "tcp")) {
		case "ws": {
			const w = ss.wsSettings ?? {}
			return normalizeHostValue(w.host || w.headers?.Host || w.headers?.host)
		}
		case "httpupgrade": {
			const w = ss.httpupgradeSettings ?? {}
			return normalizeHostValue(w.host || w.headers?.Host)
		}
		case "xhttp":
		case "splithttp": {
			const w = ss.xhttpSettings ?? ss.splithttpSettings ?? {}
			return normalizeHostValue(w.host || w.headers?.Host)
		}
		case "grpc":
			return normalizeHostValue(ss.grpcSettings?.authority)
		case "http":
		case "h2": {
			const hosts = (ss.httpSettings ?? {}).host
			return normalizeHostValue(Array.isArray(hosts) ? hosts[0] : hosts)
		}
		default:
			return ""
	}
}

function pushCandidate(out: ResolvedInboundAddress[], value: unknown, source: InboundAddressSource): void {
	const host = normalizeHostValue(value)
	if (!host || !isRoutableAddress(host)) return
	if (out.some((c) => c.host === host)) return
	out.push({ host, source })
}

/** Addresses stored on the inbound itself, strongest first (steps 2-6). */
export function inboundAddressCandidates(inbound: AddressableInbound): ResolvedInboundAddress[] {
	const ss = (inbound.streamSettings ?? {}) as Record<string, any>
	const out: ResolvedInboundAddress[] = []
	pushCandidate(out, inbound.shareAddr, "share-addr")
	pushCandidate(out, inbound.nodeAddress, "node-address")
	pushCandidate(out, inbound.listen, "listen")
	if (String(ss.security || "none") === "tls") {
		const tls = ss.tlsSettings ?? {}
		pushCandidate(out, tls.serverName, "sni")
		pushCandidate(out, tls.settings?.serverName, "sni")
		pushCandidate(out, transportHostOf(ss), "transport-host")
	}
	return out
}

/** Weaker hint (step 8): a plain inbound behind a CDN still needs the CDN domain. */
function weakAddressCandidates(inbound: AddressableInbound): ResolvedInboundAddress[] {
	const ss = (inbound.streamSettings ?? {}) as Record<string, any>
	if (String(ss.security || "none") !== "none") return []
	const out: ResolvedInboundAddress[] = []
	pushCandidate(out, transportHostOf(ss), "transport-host")
	return out
}

function publicIpOf(value: unknown): string {
	if (typeof value === "string") return isRoutableAddress(value) ? normalizeHostValue(value) : ""
	if (value && typeof value === "object") {
		const o = value as Record<string, unknown>
		for (const key of ["ipv4", "ip4", "v4", "ip", "ipv6", "ip6", "v6"]) {
			const host = publicIpOf(o[key])
			if (host) return host
		}
	}
	return ""
}

function panelHostOf(baseUrl?: string | null): string {
	if (!baseUrl) return ""
	try {
		return normalizeHostValue(new URL(baseUrl).hostname)
	} catch {
		return normalizeHostValue(baseUrl)
	}
}

/** `SRP_SUB_PREFER_SERVER_HOST=1` keeps the legacy "server host always wins" behaviour. */
export function preferServerHostFromEnv(): boolean {
	const raw = String(process.env.SRP_SUB_PREFER_SERVER_HOST || "").trim().toLowerCase()
	return raw === "1" || raw === "true" || raw === "yes" || raw === "on"
}

/**
 * Resolves the address that must be written into the config of one inbound.
 * Returns an empty host when nothing usable is known, so callers can keep their own fallback.
 */
export function resolveInboundAddress(inbound: AddressableInbound, ctx: InboundAddressContext = {}): ResolvedInboundAddress {
	const serverHost = normalizeHostValue(ctx.publicHost)
	if (ctx.preferServerHost && serverHost) return { host: serverHost, source: "server-public-host" }
	const strong = inboundAddressCandidates(inbound)
	if (strong[0]) return strong[0]
	if (serverHost) return { host: serverHost, source: "server-public-host" }
	const weak = weakAddressCandidates(inbound)
	if (weak[0]) return weak[0]
	const ip = publicIpOf(ctx.publicIp)
	if (ip) return { host: ip, source: "panel-ip" }
	const panel = panelHostOf(ctx.baseUrl)
	if (panel) return { host: panel, source: "panel-url" }
	return { host: "", source: "unknown" }
}

/** Short bilingual label for the UI: [fa, en]. */
export const INBOUND_ADDRESS_SOURCE_LABEL: Record<InboundAddressSource, [string, string]> = {
	"external-proxy": ["پروکسی خارجی اینباند", "Inbound external proxy"],
	"share-addr": ["آدرس اشتراک اینباند", "Inbound share address"],
	"node-address": ["آدرس نود", "Node address"],
	listen: ["آدرس Listen اینباند", "Inbound listen address"],
	sni: ["دامنه گواهی (SNI) اینباند", "Inbound certificate domain (SNI)"],
	"transport-host": ["دامنه ترنسپورت اینباند", "Inbound transport host"],
	"server-public-host": ["دامنه عمومی سرور", "Server public host"],
	"panel-ip": ["آی‌پی گزارش‌شده پنل", "Panel reported IP"],
	"panel-url": ["دامنه پنل (آخرین گزینه)", "Panel domain (last resort)"],
	unknown: ["نامشخص", "Unknown"],
}
