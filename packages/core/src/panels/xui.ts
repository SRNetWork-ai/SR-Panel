import { PanelAuthError, PanelError } from "../util/errors"
import type {
	InboundProtocol,
	PanelAdapter,
	PanelClientStat,
	PanelConnection,
	PanelInbound,
	PanelServerStatus,
	ProvisionClientInput,
} from "./types"

type XuiResponse<T> = { success: boolean; msg?: string; obj?: T }

function parseJsonField(v: unknown): Record<string, any> {
	if (!v) return {}
	if (typeof v === "object") return v as Record<string, any>
	try {
		return JSON.parse(String(v)) as Record<string, any>
	} catch {
		return {}
	}
}

/** 3x-ui (MHSanaei) adapter — uses the long-standing /panel/api/inbounds endpoints. */
export class XuiAdapter implements PanelAdapter {
	private cookie: string | null = null

	constructor(private readonly conn: PanelConnection, private readonly timeoutMs = 15_000) {}

	private url(path: string): string {
		return this.conn.baseUrl.replace(/\/+$/, "") + path
	}

	private async raw(path: string, init: RequestInit = {}): Promise<Response> {
		const ctrl = new AbortController()
		const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
		try {
			const headers = new Headers(init.headers)
			headers.set("Accept", "application/json, text/plain, */*")
			headers.set("X-Requested-With", "XMLHttpRequest")
			if (this.cookie) headers.set("Cookie", this.cookie)
			return await fetch(this.url(path), { ...init, headers, signal: ctrl.signal, redirect: "manual" })
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			throw new PanelError(`اتصال به پنل برقرار نشد: ${msg}`)
		} finally {
			clearTimeout(timer)
		}
	}

	async login(): Promise<void> {
		const body = new URLSearchParams({ username: this.conn.username, password: this.conn.password })
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
	}

	private async call<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
		if (!this.cookie) await this.login()
		const res = await this.raw(path, init)
		const contentType = res.headers.get("content-type") ?? ""
		if ((res.status >= 300 && res.status < 400) || res.status === 401 || !contentType.includes("json")) {
			if (retry) {
				this.cookie = null
				await this.login()
				return this.call<T>(path, init, false)
			}
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

	async getStatus(): Promise<PanelServerStatus> {
		let s: any
		try {
			s = await this.call<any>("/panel/api/server/status", { method: "POST" })
		} catch {
			s = await this.call<any>("/server/status", { method: "POST" })
		}
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
						}),
					)
				: [],
		}))
	}

	/** Build the per-protocol client object 3x-ui expects inside `settings.clients[]`. */
	private clientObject(protocol: InboundProtocol, c: ProvisionClientInput): Record<string, unknown> {
		const base = {
			email: c.email,
			limitIp: c.limitIp,
			totalGB: c.totalBytes,
			expiryTime: c.expiryTimeMs,
			enable: c.enable,
			tgId: c.tgId ?? "",
			subId: c.subId,
			reset: 0,
			comment: "",
		}
		switch (protocol) {
			case "vmess":
				return { id: c.uuid, security: "auto", ...base }
			case "trojan":
				return { password: c.uuid, flow: "", ...base }
			case "shadowsocks":
				return { method: "", password: c.uuid.replace(/-/g, ""), ...base }
			case "vless":
			default:
				return { id: c.uuid, flow: c.flow ?? "", ...base }
		}
	}

	/** The path key 3x-ui uses to address a client: uuid for vless/vmess, password for trojan/ss. */
	private clientKey(protocol: InboundProtocol, uuid: string): string {
		return protocol === "shadowsocks" ? uuid.replace(/-/g, "") : uuid
	}

	async addClient(inboundId: number, protocol: InboundProtocol, c: ProvisionClientInput): Promise<void> {
		await this.postJson("/panel/api/inbounds/addClient", {
			id: inboundId,
			settings: JSON.stringify({ clients: [this.clientObject(protocol, c)] }),
		})
	}

	async updateClient(inboundId: number, protocol: InboundProtocol, c: ProvisionClientInput): Promise<void> {
		await this.postJson(`/panel/api/inbounds/updateClient/${encodeURIComponent(this.clientKey(protocol, c.uuid))}`, {
			id: inboundId,
			settings: JSON.stringify({ clients: [this.clientObject(protocol, c)] }),
		})
	}

	async deleteClient(inboundId: number, protocol: InboundProtocol, c: { uuid: string; email: string }): Promise<void> {
		await this.call(`/panel/api/inbounds/${inboundId}/delClient/${encodeURIComponent(this.clientKey(protocol, c.uuid))}`, {
			method: "POST",
		})
	}

	async resetClientTraffic(inboundId: number, email: string): Promise<void> {
		await this.call(`/panel/api/inbounds/${inboundId}/resetClientTraffic/${encodeURIComponent(email)}`, { method: "POST" })
	}

	async getOnlineEmails(): Promise<string[]> {
		const list = await this.call<string[] | null>("/panel/api/inbounds/onlines", { method: "POST" })
		return Array.isArray(list) ? list.map(String) : []
	}
}
