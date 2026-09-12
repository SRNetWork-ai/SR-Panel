import { createHash } from "node:crypto"
import { totpCode } from "../security/totp"
import { PanelAuthError, PanelError } from "../util/errors"
import type {
	InboundProtocol,
	PanelAdapter,
	PanelCapabilities,
	PanelClientStat,
	PanelConnection,
	PanelInbound,
	PanelInboundOption,
	PanelServerStatus,
	ProvisionClientInput,
} from "./types"

type XuiResponse<T> = { success: boolean; msg?: string; obj?: T }

/** Raised when a route is missing on this panel build, so the caller can fall back to the legacy one. */
class MissingEndpointError extends PanelError {
	constructor(path: string) {
		super(`endpoint not available: ${path}`)
		this.name = "MissingEndpointError"
	}
}

/**
 * Accepts anything an operator may paste (bare host, host:port, or a deep link inside the
 * panel) and returns origin + webBasePath, which is what every /panel/api/* route hangs off.
 */
export function normalizePanelBaseUrl(input: string): string {
	let url = String(input ?? "").trim()
	if (!url) return ""
	if (!/^https?:\/\//i.test(url)) url = "http://" + url
	url = url.replace(/[?#].*$/, "").replace(/\/+$/, "")
	url = url.replace(/\/panel\/api(\/.*)?$/i, "")
	url = url.replace(/\/panel\/(inbounds|clients|settings|xray|nodes|hosts)(\/.*)?$/i, "")
	url = url.replace(/\/(login|logout)$/i, "")
	return url.replace(/\/+$/, "")
}

function parseJsonField(v: unknown): Record<string, any> {
	if (!v) return {}
	if (typeof v === "object") return v as Record<string, any>
	try {
		return JSON.parse(String(v)) as Record<string, any>
	} catch {
		return {}
	}
}

/**
 * 3X-UI v3 attaches one client to several inbounds in a single call, so every client
 * route accepts either a single inbound id or the whole list.
 */
function inboundIdList(input: number | number[]): number[] {
	const ids = (Array.isArray(input) ? input : [input]).map(Number).filter((n) => Number.isFinite(n))
	return [...new Set(ids)]
}

/**
 * Node fetch has no per-request TLS switch, so panels with self-signed certificates are
 * handled by flipping the process flag for the duration of the call (ref-counted).
 */
let insecureDepth = 0
let insecurePrev: string | undefined
async function withTls<T>(insecure: boolean | undefined, fn: () => Promise<T>): Promise<T> {
	if (!insecure) return fn()
	if (insecureDepth === 0) {
		insecurePrev = process.env.NODE_TLS_REJECT_UNAUTHORIZED
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
	}
	insecureDepth++
	try {
		return await fn()
	} finally {
		insecureDepth--
		if (insecureDepth === 0) {
			if (insecurePrev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
			else process.env.NODE_TLS_REJECT_UNAUTHORIZED = insecurePrev
		}
	}
}

/** Shadowsocks 2022 needs a PSK sized to the cipher; legacy ciphers accept any string. */
/**
 * 3x-ui v3 stores the Telegram id as int64: sending a string (even an empty one)
 * makes the panel answer `cannot unmarshal string into Go struct field .client.tgId`.
 */
export function toTgId(v: unknown): number {
	const raw = String(v ?? "").trim().replace(/^@/, "")
	if (!/^-?\d{1,18}$/.test(raw)) return 0
	const n = Number(raw)
	return Number.isSafeInteger(n) ? n : 0
}

export function shadowsocksPassword(method: string, seed: string): string {
	const m = (method ?? "").toLowerCase()
	if (m.includes("2022")) {
		const bytes = m.includes("aes-128") ? 16 : 32
		return createHash("sha256").update(seed).digest().subarray(0, bytes).toString("base64")
	}
	return seed.replace(/-/g, "")
}

/**
 * 3X-UI adapter (MHSanaei). Speaks the v3 API - Bearer API tokens, first-class
 * /panel/api/clients/* endpoints and /panel/api/inbounds/options - and transparently
 * falls back to the legacy /panel/api/inbounds/* routes on older 2.x builds.
 */
export class XuiAdapter implements PanelAdapter {
	private cookie: string | null = null
	private csrf: string | null = null
	private caps: PanelCapabilities | null = null
	readonly baseUrl: string
	private readonly timeoutMs: number

	constructor(private readonly conn: PanelConnection, timeoutMs?: number) {
		this.baseUrl = normalizePanelBaseUrl(conn.baseUrl)
		this.timeoutMs = timeoutMs ?? conn.timeoutMs ?? 15_000
	}

	/** Bearer mode short-circuits the login + CSRF dance entirely. */
	private get usesToken(): boolean {
		const mode = this.conn.authMode ?? (this.conn.apiToken ? "token" : "password")
		return mode === "token" && Boolean(this.conn.apiToken)
	}

	private url(path: string): string {
		return this.baseUrl + path
	}

	private async raw(path: string, init: RequestInit = {}): Promise<Response> {
		const ctrl = new AbortController()
		const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
		try {
			const headers = new Headers(init.headers)
			headers.set("Accept", "application/json, text/plain, */*")
			headers.set("X-Requested-With", "XMLHttpRequest")
			if (this.usesToken) headers.set("Authorization", `Bearer ${this.conn.apiToken}`)
			else if (this.cookie) headers.set("Cookie", this.cookie)
			const method = String(init.method ?? "GET").toUpperCase()
			if (this.csrf && method !== "GET") headers.set("X-CSRF-Token", this.csrf)
			return await withTls(this.conn.insecureTls, () =>
				fetch(this.url(path), { ...init, headers, signal: ctrl.signal, redirect: "manual" }),
			)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			throw new PanelError(`اتصال به پنل برقرار نشد: ${msg}`)
		} finally {
			clearTimeout(timer)
		}
	}

	/** A stored TOTP secret lets us answer the panel 2FA prompt without a human. */
	private twoFactor(): string | undefined {
		if (this.conn.twoFactorCode) return this.conn.twoFactorCode.trim()
		if (this.conn.totpSecret) {
			try {
				return totpCode(this.conn.totpSecret)
			} catch {
				return undefined
			}
		}
		return undefined
	}

	async login(): Promise<void> {
		if (this.usesToken) {
			this.cookie = null
			return
		}
		const username = (this.conn.username ?? "").trim()
		if (!username || !this.conn.password) throw new PanelAuthError("نام کاربری یا رمز عبور پنل تنظیم نشده است")
		const body = new URLSearchParams({ username, password: this.conn.password })
		const code = this.twoFactor()
		if (code) {
			body.set("twoFactorCode", code)
			body.set("loginSecret", code)
		}
		const res = await this.raw("/login", {
			method: "POST",
			body,
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
		})
		const json = (await res.json().catch(() => null)) as XuiResponse<unknown> | null
		if (!json?.success) throw new PanelAuthError(json?.msg || `ورود به پنل ناموفق بود (${res.status})`)
		const setCookies: string[] =
			typeof (res.headers as any).getSetCookie === "function"
				? (res.headers as any).getSetCookie()
				: (res.headers.get("set-cookie") ?? "").split(/,(?=\s*[A-Za-z0-9_-]+=)/)
		const pairs = setCookies.map((c) => c.split(";")[0]!.trim()).filter(Boolean)
		if (!pairs.length) throw new PanelAuthError("پنل کوکی سشن برنگرداند")
		this.cookie = pairs.join("; ")
		await this.loadCsrf()
	}

	/** v3 browser sessions replay a CSRF token on unsafe requests; older builds have no such route. */
	private async loadCsrf(): Promise<void> {
		try {
			const res = await this.raw("/csrf-token", { method: "GET" })
			if (!res.ok) return
			const json = (await res.json().catch(() => null)) as any
			const token = typeof json?.obj === "string" ? json.obj : (json?.obj?.token ?? json?.token)
			if (token) this.csrf = String(token)
		} catch {
			/* pre-v3 panel */
		}
	}

	private async call<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
		if (!this.usesToken && !this.cookie) await this.login()
		const res = await this.raw(path, init)
		if (res.status === 404 || res.status === 405) throw new MissingEndpointError(path)
		const contentType = res.headers.get("content-type") ?? ""
		const unauthorized = res.status === 401 || res.status === 403
		if ((res.status >= 300 && res.status < 400) || unauthorized || !contentType.includes("json")) {
			if (retry && !this.usesToken) {
				this.cookie = null
				this.csrf = null
				await this.login()
				return this.call<T>(path, init, false)
			}
			if (unauthorized)
				throw new PanelAuthError(
					this.usesToken ? "توکن API پنل نامعتبر است یا دسترسی کافی ندارد" : "نشست پنل معتبر نیست",
				)
			throw new PanelError(`پاسخ غیرمنتظره از پنل (${res.status}) در ${path}`)
		}
		const json = (await res.json()) as XuiResponse<T>
		if (!json.success) throw new PanelError(json.msg || `خطای پنل در ${path}`)
		return json.obj as T
	}

	private postJson<T>(path: string, body: unknown): Promise<T> {
		return this.call<T>(path, {
			method: "POST",
			body: JSON.stringify(body),
			headers: { "Content-Type": "application/json" },
		})
	}

	/** Runs the v3 route first and falls back to the legacy one when it is absent. */
	private async attempt<T>(steps: Array<() => Promise<T>>): Promise<T> {
		let last: unknown
		for (const step of steps) {
			try {
				return await step()
			} catch (err) {
				if (!(err instanceof MissingEndpointError)) throw err
				last = err
			}
		}
		throw last instanceof Error ? last : new PanelError("این نسخه از پنل، این عملیات را پشتیبانی نمی‌کند")
	}

	/** Detects what this panel build supports; cached for the lifetime of the adapter. */
	async probe(): Promise<PanelCapabilities> {
		if (this.caps) return this.caps
		if (!this.usesToken && !this.cookie) await this.login()
		let inboundOptions = false
		let clientsApi = false
		try {
			await this.call<any[]>("/panel/api/inbounds/options", { method: "GET" })
			inboundOptions = true
		} catch (err) {
			if (!(err instanceof MissingEndpointError)) throw err
		}
		try {
			await this.call<any>("/panel/api/clients/groups", { method: "GET" })
			clientsApi = true
		} catch (err) {
			if (!(err instanceof MissingEndpointError)) throw err
		}
		const status = await this.getStatus().catch(() => null)
		this.caps = {
			clientsApi,
			inboundOptions,
			bearerAuth: this.usesToken,
			twoFactor: await this.twoFactorEnabled(),
			panelVersion: status?.panelVersion,
			xrayVersion: status?.xrayVersion,
		}
		return this.caps
	}

	private async twoFactorEnabled(): Promise<boolean> {
		try {
			const r = await this.call<any>("/getTwoFactorEnable", { method: "POST" })
			if (typeof r === "boolean") return r
			return Boolean(r?.twoFactorEnable ?? r?.enable ?? false)
		} catch {
			return false
		}
	}

	async getStatus(): Promise<PanelServerStatus> {
		const s = await this.attempt<any>([
			() => this.call<any>("/panel/api/server/status", { method: "GET" }),
			() => this.call<any>("/panel/api/server/status", { method: "POST" }),
			() => this.call<any>("/server/status", { method: "POST" }),
		])
		const version = s?.appVersion ?? s?.version ?? s?.panelVersion
		return {
			cpu: Number(s?.cpu ?? 0),
			memUsed: Number(s?.mem?.current ?? 0),
			memTotal: Number(s?.mem?.total ?? 0),
			diskUsed: Number(s?.disk?.current ?? 0),
			diskTotal: Number(s?.disk?.total ?? 0),
			uptime: Number(s?.uptime ?? 0),
			xrayState: String(s?.xray?.state ?? "unknown"),
			xrayVersion: s?.xray?.version ? String(s.xray.version) : undefined,
			netUp: Number(s?.netIO?.up ?? 0),
			netDown: Number(s?.netIO?.down ?? 0),
			totalSent: Number(s?.netTraffic?.sent ?? 0),
			totalRecv: Number(s?.netTraffic?.recv ?? 0),
			publicIp: s?.publicIP?.ipv4 ? String(s.publicIP.ipv4) : undefined,
			tcpCount: Number(s?.tcpCount ?? 0),
			udpCount: Number(s?.udpCount ?? 0),
			panelVersion: version ? String(version) : undefined,
		}
	}

	async listInbounds(): Promise<PanelInbound[]> {
		const list = (await this.call<any[]>("/panel/api/inbounds/list", { method: "GET" })) ?? []
		return list.map((ib) => ({
			id: Number(ib.id),
			remark: String(ib.remark ?? ""),
			port: Number(ib.port),
			protocol: String(ib.protocol ?? "vless") as InboundProtocol,
			enable: Boolean(ib.enable),
			tag: String(ib.tag ?? ""),
			listen: String(ib.listen ?? ""),
			up: Number(ib.up ?? 0),
			down: Number(ib.down ?? 0),
			total: Number(ib.total ?? 0),
			expiryTime: Number(ib.expiryTime ?? 0),
			settings: parseJsonField(ib.settings),
			streamSettings: parseJsonField(ib.streamSettings),
			nodeId: ib.nodeId != null ? Number(ib.nodeId) : undefined,
			clientStats: Array.isArray(ib.clientStats)
				? ib.clientStats.map(
						(c: any): PanelClientStat => ({
							email: String(c.email ?? ""),
							up: Number(c.up ?? 0),
							down: Number(c.down ?? 0),
							total: Number(c.total ?? 0),
							expiryTime: Number(c.expiryTime ?? 0),
							enable: Boolean(c.enable),
							inboundId: Number(c.inboundId ?? ib.id),
							reset: Number(c.reset ?? 0),
							lastOnline: c.lastOnline != null ? Number(c.lastOnline) : undefined,
						}),
					)
				: [],
		}))
	}

	/** Picker projection used by the "add panel" flow - cheap even on panels with 10k clients. */
	async listInboundOptions(): Promise<PanelInboundOption[]> {
		try {
			const list = (await this.call<any[]>("/panel/api/inbounds/options", { method: "GET" })) ?? []
			return list.map((o) => ({
				id: Number(o.id),
				remark: String(o.remark ?? ""),
				tag: String(o.tag ?? ""),
				protocol: String(o.protocol ?? "vless") as InboundProtocol,
				port: Number(o.port ?? 0),
				listen: o.listen ? String(o.listen) : undefined,
				enable: o.enable !== false,
				tlsFlowCapable: Boolean(o.tlsFlowCapable),
				ssMethod: String(o.ssMethod ?? ""),
				nodeId: o.nodeId != null ? Number(o.nodeId) : undefined,
				nodeAddress: o.nodeAddress ? String(o.nodeAddress) : undefined,
				shareAddr: o.shareAddr ? String(o.shareAddr) : undefined,
			}))
		} catch (err) {
			if (!(err instanceof MissingEndpointError)) throw err
			return (await this.listInbounds()).map((i) => {
				const network = String(i.streamSettings?.network ?? "tcp")
				const security = String(i.streamSettings?.security ?? "none")
				return {
					id: i.id,
					remark: i.remark,
					tag: i.tag,
					protocol: i.protocol,
					port: i.port,
					listen: i.listen || undefined,
					enable: i.enable,
					tlsFlowCapable:
						i.protocol === "vless" && network === "tcp" && (security === "tls" || security === "reality"),
					ssMethod: i.protocol === "shadowsocks" ? String(i.settings?.method ?? "") : "",
				}
			})
		}
	}

	/** The per-protocol client row shared by the v3 clients API and the legacy settings blob. */
	private clientObject(protocol: InboundProtocol, c: ProvisionClientInput, legacy = false): Record<string, unknown> {
		const tg = toTgId(c.tgId)
		const base = {
			email: c.email,
			limitIp: Number(c.limitIp) || 0,
			totalGB: Number(c.totalBytes) || 0,
			expiryTime: Number(c.expiryTimeMs) || 0,
			enable: c.enable !== false,
			// v3 expects int64, panels older than 2.4 expect a string
			tgId: legacy ? (tg ? String(tg) : "") : tg,
			subId: c.subId,
			reset: 0,
			comment: c.comment ?? "",
			group: c.group ?? "",
			limitHwid: Number(c.limitHwid) || 0,
		}
		switch (protocol) {
			case "vmess":
				return { id: c.uuid, security: "auto", ...base }
			case "trojan":
				return { password: c.uuid, flow: "", ...base }
			case "shadowsocks":
				return { method: c.ssMethod ?? "", password: shadowsocksPassword(c.ssMethod ?? "", c.uuid), ...base }
			case "vless":
			default:
				return { id: c.uuid, flow: c.flow ?? "", ...base }
		}
	}

	/** Legacy routes address a client by its secret: uuid for vless/vmess, password for trojan/ss. */
	private clientKey(protocol: InboundProtocol, uuid: string, ssMethod?: string): string {
		if (protocol === "shadowsocks") return shadowsocksPassword(ssMethod ?? "", uuid)
		return uuid
	}

	/**
	 * Creates one client attached to every given inbound - that is what the panel's own
	 * client editor does. Legacy builds only know one inbound per call and reject a
	 * duplicate email, so a multi-inbound request fails loudly instead of half-creating.
	 */
	async addClient(inboundIds: number | number[], protocol: InboundProtocol, c: ProvisionClientInput): Promise<void> {
		const ids = inboundIdList(inboundIds)
		if (!ids.length) throw new PanelError("هیچ اینباندی برای ساخت کانفیگ انتخاب نشده است")
		await this.attempt<void>([
			async () => {
				await this.postJson("/panel/api/clients/add", {
					client: this.clientObject(protocol, c),
					inboundIds: ids,
				})
			},
			async () => {
				if (ids.length > 1) throw new PanelError("این نسخه از پنل، یک کلاینت روی چند اینباند را پشتیبانی نمی‌کند")
				await this.postJson("/panel/api/inbounds/addClient", {
					id: ids[0],
					settings: JSON.stringify({ clients: [this.clientObject(protocol, c, true)] }),
				})
			},
		])
	}

	/** The id list *is* the client's inbound membership: a partial list detaches the rest. */
	async updateClient(inboundIds: number | number[], protocol: InboundProtocol, c: ProvisionClientInput): Promise<void> {
		const ids = inboundIdList(inboundIds)
		if (!ids.length) throw new PanelError("هیچ اینباندی برای به‌روزرسانی کانفیگ انتخاب نشده است")
		const key = encodeURIComponent(this.clientKey(protocol, c.uuid, c.ssMethod))
		await this.attempt<void>([
			async () => {
				await this.postJson(`/panel/api/clients/update/${encodeURIComponent(c.email)}`, {
					client: this.clientObject(protocol, c),
					inboundIds: ids,
				})
			},
			async () => {
				if (ids.length > 1) throw new PanelError("این نسخه از پنل، یک کلاینت روی چند اینباند را پشتیبانی نمی‌کند")
				await this.postJson(`/panel/api/inbounds/updateClient/${key}`, {
					id: ids[0],
					settings: JSON.stringify({ clients: [this.clientObject(protocol, c, true)] }),
				})
			},
		])
	}

	async deleteClient(
		inboundIds: number | number[],
		protocol: InboundProtocol,
		c: { uuid: string; email: string; ssMethod?: string },
	): Promise<void> {
		const ids = inboundIdList(inboundIds)
		const key = encodeURIComponent(this.clientKey(protocol, c.uuid, c.ssMethod))
		await this.attempt<void>([
			async () => {
				await this.call(`/panel/api/clients/del/${encodeURIComponent(c.email)}`, { method: "POST" })
			},
			async () => {
				for (const id of ids) await this.call(`/panel/api/inbounds/${id}/delClient/${key}`, { method: "POST" })
			},
		])
	}

	async resetClientTraffic(inboundId: number, email: string): Promise<void> {
		await this.attempt([
			() => this.call(`/panel/api/clients/resetTraffic/${encodeURIComponent(email)}`, { method: "POST" }),
			() => this.call(`/panel/api/inbounds/${inboundId}/resetClientTraffic/${encodeURIComponent(email)}`, { method: "POST" }),
		])
	}

	async getOnlineEmails(): Promise<string[]> {
		const list = await this.attempt<string[] | null>([
			() => this.call<string[] | null>("/panel/api/clients/onlines", { method: "POST" }),
			() => this.call<string[] | null>("/panel/api/inbounds/onlines", { method: "POST" }),
		])
		return Array.isArray(list) ? list.map(String) : []
	}

	/** Every share URL of one client across the inbounds it is attached to (v3 only). */
	async getClientLinks(email: string): Promise<string[]> {
		try {
			const list = await this.call<string[] | null>(`/panel/api/clients/links/${encodeURIComponent(email)}`, {
				method: "GET",
			})
			return Array.isArray(list) ? list.map(String) : []
		} catch (err) {
			if (err instanceof MissingEndpointError) return []
			throw err
		}
	}

	async getSubLinks(subId: string): Promise<string[]> {
		try {
			const list = await this.call<string[] | null>(`/panel/api/clients/subLinks/${encodeURIComponent(subId)}`, {
				method: "GET",
			})
			return Array.isArray(list) ? list.map(String) : []
		} catch (err) {
			if (err instanceof MissingEndpointError) return []
			throw err
		}
	}
}
