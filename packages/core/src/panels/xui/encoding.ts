import { createHash } from "node:crypto"

/** 3X-UI v3 already returns `settings` / `streamSettings` as objects; older builds send JSON strings. */
export function parseJsonField(v: unknown): Record<string, any> {
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
export function inboundIdList(input: number | number[]): number[] {
	const ids = (Array.isArray(input) ? input : [input]).map(Number).filter((n) => Number.isFinite(n))
	return [...new Set(ids)]
}

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

/** Shadowsocks 2022 needs a PSK sized to the cipher; legacy ciphers accept any string. */
export function shadowsocksPassword(method: string, seed: string): string {
	const m = (method ?? "").toLowerCase()
	if (m.includes("2022")) {
		const bytes = m.includes("aes-128") ? 16 : 32
		return createHash("sha256").update(seed).digest().subarray(0, bytes).toString("base64")
	}
	return seed.replace(/-/g, "")
}
