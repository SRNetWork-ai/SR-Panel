import { createHash } from "node:crypto"

/** USDT (TRC20) contract on Tron mainnet */
export const USDT_TRC20 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

function base58(bytes: Uint8Array): string {
	let n = 0n
	for (const b of bytes) n = (n << 8n) + BigInt(b)
	let out = ""
	while (n > 0n) {
		const r = Number(n % 58n)
		n /= 58n
		out = B58[r] + out
	}
	for (const b of bytes) {
		if (b !== 0) break
		out = "1" + out
	}
	return out
}

/** Convert a Tron hex address (41… or 0x…20 bytes) to base58check (T…) */
export function tronHexToBase58(hex: string): string {
	let h = hex.toLowerCase().replace(/^0x/, "")
	if (h.length === 40) h = "41" + h
	if (h.length !== 42) return hex
	const payload = Buffer.from(h, "hex")
	const c1 = createHash("sha256").update(payload).digest()
	const c2 = createHash("sha256").update(c1).digest()
	return base58(Buffer.concat([payload, c2.subarray(0, 4)]))
}

export type TronVerifyStatus = "confirmed" | "pending" | "not_found" | "mismatch" | "error"
export interface TronVerifyResult {
	ok: boolean
	status: TronVerifyStatus
	amount?: number
	from?: string
	to?: string
	timestamp?: number
	error?: string
}

const isTxid = (s: string) => /^[0-9a-fA-F]{64}$/.test(s)

/** Verify a USDT-TRC20 transfer (by txid) to `toAddress` of at least `minAmount` USDT. */
export async function verifyTrc20Payment(txid: string, toAddress: string, minAmount: number, tolerance = 0.02): Promise<TronVerifyResult> {
	const id = txid.trim().replace(/^0x/, "")
	if (!isTxid(id)) return { ok: false, status: "mismatch", error: "TXID نامعتبر است" }
	const want = toAddress.trim()
	// 1) Tronscan (rich, includes token transfer info)
	try {
		const res = await fetch(`https://apilist.tronscanapi.com/api/transaction-info?hash=${id}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) })
		if (res.ok) {
			const j = (await res.json()) as Record<string, unknown>
			if (j && Object.keys(j).length) {
				const transfers = (Array.isArray(j.trc20TransferInfo) ? j.trc20TransferInfo : Array.isArray(j.tokenTransferInfo) ? [j.tokenTransferInfo] : []) as Array<Record<string, unknown>>
				const t = transfers.find((x) => String(x.contract_address ?? "") === USDT_TRC20 && String(x.to_address ?? "") === want)
				if (!t) return { ok: false, status: "mismatch", error: "این تراکنش انتقال USDT به آدرس فروشگاه نیست" }
				const decimals = Number(t.decimals ?? 6)
				const amount = Number(t.amount_str ?? t.amount ?? 0) / 10 ** decimals
				const confirmed = Boolean(j.confirmed) && (j.contractRet === undefined || j.contractRet === "SUCCESS")
				if (!confirmed) return { ok: false, status: "pending", amount, error: "تراکنش هنوز تأیید نشده است" }
				if (amount + tolerance < minAmount) return { ok: false, status: "mismatch", amount, error: `مبلغ تراکنش (${amount}) کمتر از مبلغ سفارش است` }
				return { ok: true, status: "confirmed", amount, from: String(t.from_address ?? ""), to: want, timestamp: Number(j.timestamp ?? 0) }
			}
		}
	} catch {
		/* fall through to TronGrid */
	}
	// 2) TronGrid events (fallback)
	try {
		const headers: Record<string, string> = { accept: "application/json" }
		if (process.env.SRP_TRONGRID_KEY) headers["TRON-PRO-API-KEY"] = process.env.SRP_TRONGRID_KEY
		const res = await fetch(`https://api.trongrid.io/v1/transactions/${id}/events`, { headers, signal: AbortSignal.timeout(15_000) })
		if (!res.ok) return { ok: false, status: "error", error: `TronGrid HTTP ${res.status}` }
		const j = (await res.json()) as { data?: Array<Record<string, unknown>> }
		const events = j.data ?? []
		if (!events.length) return { ok: false, status: "not_found", error: "تراکنش پیدا نشد (یا هنوز ثبت نشده)" }
		for (const ev of events) {
			if (ev.event_name !== "Transfer" || String(ev.contract_address) !== USDT_TRC20) continue
			const r = (ev.result ?? {}) as Record<string, unknown>
			const to = tronHexToBase58(String(r.to ?? ""))
			if (to !== want) continue
			const amount = Number(r.value ?? 0) / 1e6
			if (amount + tolerance < minAmount) return { ok: false, status: "mismatch", amount, error: `مبلغ تراکنش (${amount}) کمتر از مبلغ سفارش است` }
			return { ok: true, status: "confirmed", amount, from: tronHexToBase58(String(r.from ?? "")), to, timestamp: Number(ev.block_timestamp ?? 0) }
		}
		return { ok: false, status: "mismatch", error: "انتقال USDT به آدرس فروشگاه در این تراکنش یافت نشد" }
	} catch (err) {
		return { ok: false, status: "error", error: err instanceof Error ? err.message : String(err) }
	}
}
