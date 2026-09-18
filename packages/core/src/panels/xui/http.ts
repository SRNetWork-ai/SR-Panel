import { totpCode } from "../../security/totp"
import { PanelAuthError, PanelError } from "../../util/errors"
import type { PanelConnection } from "../types"
import { MissingEndpointError } from "./errors"
import { withTls } from "./tls"
import { normalizePanelBaseUrl } from "./url"

export type XuiResponse<T> = { success: boolean; msg?: string; obj?: T }

/**
 * Transport half of the 3X-UI adapter: base URL handling, password/Bearer auth, CSRF,
 * the `{ success, msg, obj }` envelope and the v3 -> legacy route fallback.
 */
export class XuiHttpClient {
	private cookie: string | null = null
	private csrf: string | null = null
	readonly baseUrl: string
	private readonly timeoutMs: number

	constructor(
		private readonly conn: PanelConnection,
		timeoutMs?: number,
	) {
		this.baseUrl = normalizePanelBaseUrl(conn.baseUrl)
		this.timeoutMs = timeoutMs ?? conn.timeoutMs ?? 15_000
	}

	/** Bearer mode short-circuits the login + CSRF dance entirely. */
	get usesToken(): boolean {
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

	/** Opens a cookie session when one is missing; a no-op in Bearer mode. */
	async ensureSession(): Promise<void> {
		if (!this.usesToken && !this.cookie) await this.login()
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

	async call<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
		await this.ensureSession()
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

	postJson<T>(path: string, body: unknown): Promise<T> {
		return this.call<T>(path, {
			method: "POST",
			body: JSON.stringify(body),
			headers: { "Content-Type": "application/json" },
		})
	}

	/** Runs the v3 route first and falls back to the legacy one when it is absent. */
	async attempt<T>(steps: Array<() => Promise<T>>): Promise<T> {
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

	async twoFactorEnabled(): Promise<boolean> {
		try {
			const r = await this.call<any>("/getTwoFactorEnable", { method: "POST" })
			if (typeof r === "boolean") return r
			return Boolean(r?.twoFactorEnable ?? r?.enable ?? false)
		} catch {
			return false
		}
	}
}
