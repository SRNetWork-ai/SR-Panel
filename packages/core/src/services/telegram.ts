import { readFile } from "node:fs/promises"
import { basename } from "node:path"
import { getTelegramSettings } from "./settings"

const API = "https://api.telegram.org"

export type TgResult<T = unknown> = { ok: true; result: T } | { ok: false; error: string }

export async function tgCall<T = unknown>(token: string, method: string, body?: Record<string, unknown> | FormData): Promise<TgResult<T>> {
	if (!token) return { ok: false, error: "bot token not set" }
	try {
		const init: RequestInit =
			body instanceof FormData
				? { method: "POST", body }
				: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }
		const res = await fetch(`${API}/bot${token}/${method}`, { ...init, signal: AbortSignal.timeout(method === "getUpdates" ? 45_000 : 20_000) })
		const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string }
		if (!res.ok || !data.ok) return { ok: false, error: data.description || `HTTP ${res.status}` }
		return { ok: true, result: data.result as T }
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) }
	}
}

export const tgEscape = (s: string | null | undefined) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export async function tgSendMessage(text: string, opts: { chatId?: string; token?: string; silent?: boolean } = {}): Promise<TgResult> {
	const s = await getTelegramSettings()
	const token = opts.token ?? s.botToken
	const chatId = opts.chatId ?? s.chatId
	if (!token || !chatId) return { ok: false, error: "telegram not configured" }
	return tgCall(token, "sendMessage", { chat_id: chatId, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, disable_notification: !!opts.silent })
}

export async function tgSendDocument(filePath: string, caption?: string, opts: { chatId?: string; token?: string } = {}): Promise<TgResult> {
	const s = await getTelegramSettings()
	const token = opts.token ?? s.botToken
	const chatId = opts.chatId ?? s.chatId
	if (!token || !chatId) return { ok: false, error: "telegram not configured" }
	const buf = await readFile(filePath)
	if (buf.byteLength > 49 * 1024 * 1024) return { ok: false, error: "file larger than Telegram bot limit (50MB)" }
	const fd = new FormData()
	fd.append("chat_id", chatId)
	if (caption) {
		fd.append("caption", caption.slice(0, 1000))
		fd.append("parse_mode", "HTML")
	}
	fd.append("document", new Blob([buf as unknown as BlobPart]), basename(filePath))
	return tgCall(token, "sendDocument", fd)
}

export async function tgGetMe(token: string) {
	return tgCall<{ id: number; username: string; first_name: string }>(token, "getMe")
}
