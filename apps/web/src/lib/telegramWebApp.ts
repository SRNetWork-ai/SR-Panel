import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"

/** Validates Telegram WebApp initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) */
export function verifyTelegramInitData(initData: string, botToken: string, maxAgeSec = 86_400): { ok: boolean; user?: { id: number; first_name?: string; last_name?: string; username?: string } } {
	try {
		const params = new URLSearchParams(initData)
		const hash = params.get("hash")
		if (!hash) return { ok: false }
		params.delete("hash")
		const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n")
		const secret = createHmac("sha256", "WebAppData").update(botToken).digest()
		const calc = createHmac("sha256", secret).update(dataCheck).digest("hex")
		if (calc.length !== hash.length || !timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return { ok: false }
		const authDate = Number(params.get("auth_date") || 0)
		if (maxAgeSec && Date.now() / 1000 - authDate > maxAgeSec) return { ok: false }
		const user = params.get("user") ? (JSON.parse(params.get("user")!) as { id: number; first_name?: string; last_name?: string; username?: string }) : undefined
		return { ok: true, user }
	} catch {
		return { ok: false }
	}
}
