/* Browser-side fetch helper (no server imports). */

export class ApiError extends Error {
	constructor(message: string, public status: number, public code?: string) {
		super(message)
	}
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
	const { json, ...rest } = init
	const res = await fetch(path, {
		...rest,
		headers: { Accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
		body: json !== undefined ? JSON.stringify(json) : rest.body,
		credentials: "same-origin",
		cache: "no-store",
	})
	const data = await res.json().catch(() => ({}))
	if (!res.ok) throw new ApiError((data as any)?.error || `HTTP ${res.status}`, res.status, (data as any)?.code)
	return data as T
}

export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		const el = document.createElement("textarea")
		el.value = text
		document.body.appendChild(el)
		el.select()
		const ok = document.execCommand("copy")
		el.remove()
		return ok
	}
}
