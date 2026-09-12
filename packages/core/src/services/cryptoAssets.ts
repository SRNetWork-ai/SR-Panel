import { prisma, type Payment, type StoreSettings } from "@srpanel/db"
import { z } from "zod"
import { AppError, NotFoundError } from "../util/errors"
import { effectiveUsdtRate, pickPath, toNumber } from "./fx"
import { getSetting, setSetting } from "./settings"
import { storeSettingsByAdminId } from "./storeSettings"

/**
 * Multi-coin crypto checkout.
 *
 * A seller may publish several receiving wallets (USDT-TRC20, USDT-BEP20, TON,
 * TRX …). Stablecoins are priced with the seller's USDT rate (see fx.ts), every
 * other coin with its live market price; both are refreshed on demand, so the
 * buyer always gets a freshly calculated amount without anybody pressing a
 * button. The list lives in the generic Setting table -> no DB migration, and the
 * chosen wallet is snapshotted into `Payment.meta.crypto`.
 */

export const CRYPTO_NETWORKS = ["TRC20", "BEP20", "ERC20", "TON", "SOL", "POLYGON", "ARBITRUM", "AVAX", "BTC", "LTC", "DOGE", "XMR", "OTHER"] as const
export type CryptoNetwork = (typeof CRYPTO_NETWORKS)[number]

export const CRYPTO_NETWORK_LABELS: Record<CryptoNetwork, string> = {
	TRC20: "ترون (TRC20)",
	BEP20: "BNB Smart Chain (BEP20)",
	ERC20: "اتریوم (ERC20)",
	TON: "تون (TON)",
	SOL: "سولانا (SOL)",
	POLYGON: "پالیگان (Polygon)",
	ARBITRUM: "آربیتروم (Arbitrum)",
	AVAX: "آوالانچ (C-Chain)",
	BTC: "بیت‌کوین",
	LTC: "لایت‌کوین",
	DOGE: "دوج‌کوین",
	XMR: "مونرو",
	OTHER: "شبکه‌ی دیگر",
}

/** Priced by the seller's USDT rate instead of a market lookup. */
export const STABLE_SYMBOLS = ["USDT", "USDC", "DAI", "FDUSD", "TUSD", "BUSD"]

export const cryptoAssetSchema = z.object({
	id: z.string().max(40).default(""),
	symbol: z.string().trim().max(12).default("USDT"),
	network: z.enum(CRYPTO_NETWORKS).default("TRC20"),
	address: z.string().trim().max(200).default(""),
	/** TON / some exchanges need a payment id next to the address */
	memo: z.string().trim().max(120).default(""),
	label: z.string().trim().max(60).default(""),
	enabled: z.boolean().default(true),
	/** USDT = dollar rate, MARKET = live coin price, FIXED = fixedRate below */
	rateMode: z.enum(["USDT", "MARKET", "FIXED"]).default("USDT"),
	/** IRT per 1 coin */
	fixedRate: z.number().min(0).max(1e12).default(0),
	marginPct: z.number().min(-50).max(200).default(0),
	/** 0 = pick automatically from the coin price */
	decimals: z.number().int().min(0).max(8).default(0),
})
export type CryptoAsset = z.infer<typeof cryptoAssetSchema>

export const cryptoSettingsSchema = z.object({ assets: z.array(cryptoAssetSchema).max(20).default([]) })
export type CryptoSettings = z.infer<typeof cryptoSettingsSchema>

const cryptoKey = (adminId: string) => `store:crypto:${adminId}`

export const cryptoSettings = (adminId: string) => getSetting(cryptoKey(adminId), cryptoSettingsSchema, 5_000)

export async function saveCryptoAssets(adminId: string, assets: Array<Partial<CryptoAsset>>): Promise<CryptoSettings> {
	const seen = new Set<string>()
	const clean: CryptoAsset[] = []
	for (const [i, raw] of assets.slice(0, 20).entries()) {
		const parsed = cryptoAssetSchema.parse({ ...raw })
		const symbol = parsed.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "USDT"
		let id = (parsed.id || "").trim() || symbol.toLowerCase() + "-" + parsed.network.toLowerCase()
		while (seen.has(id)) id = id + "-" + (i + 1)
		seen.add(id)
		clean.push({ ...parsed, id, symbol })
	}
	return setSetting(cryptoKey(adminId), cryptoSettingsSchema, { assets: clean })
}

/** Sellers who never opened the new editor keep their single legacy USDT wallet. */
export function legacyAsset(s: Pick<StoreSettings, "usdtAddress" | "usdtNetwork">): CryptoAsset | null {
	if (!s.usdtAddress) return null
	const network = (CRYPTO_NETWORKS as readonly string[]).includes(s.usdtNetwork) ? (s.usdtNetwork as CryptoNetwork) : "TRC20"
	return cryptoAssetSchema.parse({ id: "legacy", symbol: "USDT", network, address: s.usdtAddress, rateMode: "USDT" })
}

/** Wallets a buyer may pay to, newest configuration first, legacy wallet as fallback. */
export async function availableAssets(s: StoreSettings): Promise<CryptoAsset[]> {
	const cfg = await cryptoSettings(s.adminId)
	const list = cfg.assets.filter((a) => a.enabled && a.address)
	if (list.length) return list
	const legacy = legacyAsset(s)
	return legacy ? [legacy] : []
}

/* ---------- pricing ---------- */

const coinCacheSchema = z.object({ rate: z.number().default(0), at: z.string().max(40).default(""), source: z.string().max(40).default("") })
const COIN_TTL_MS = 10 * 60_000
const TIMEOUT_MS = 6_000

async function getJson(url: string): Promise<unknown> {
	const ac = new AbortController()
	const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
	try {
		const res = await fetch(url, { signal: ac.signal, cache: "no-store", headers: { accept: "application/json", "user-agent": "SRPanel/1.0" } })
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		return (await res.json()) as unknown
	} finally {
		clearTimeout(timer)
	}
}

function withMargin(rate: number, marginPct: number): number {
	const v = rate * (1 + (marginPct || 0) / 100)
	return Math.max(1, Math.round(v))
}

export function effectiveRateMode(a: Pick<CryptoAsset, "symbol" | "rateMode">): "FIXED" | "USDT" | "MARKET" {
	if (a.rateMode === "FIXED") return "FIXED"
	return STABLE_SYMBOLS.includes(a.symbol.toUpperCase()) ? "USDT" : "MARKET"
}

/** Live IRT price of one coin (Nobitex, then Wallex), cached for 10 minutes. */
export async function marketRate(symbol: string): Promise<{ rate: number; source: string }> {
	const sym = symbol.toUpperCase()
	const cacheKey = "fx:coin:" + sym
	const cached = await getSetting(cacheKey, coinCacheSchema, 5_000)
	const at = cached.at ? Date.parse(cached.at) : NaN
	if (cached.rate > 0 && Number.isFinite(at) && Date.now() - at < COIN_TTL_MS) return { rate: cached.rate, source: cached.source || "CACHE" }

	let rate = 0
	let source = ""
	try {
		const low = sym.toLowerCase()
		const j = await getJson("https://api.nobitex.ir/market/stats?srcCurrency=" + low + "&dstCurrency=rls")
		const rls = toNumber(pickPath(j, "stats." + low + "-rls.latest") ?? pickPath(j, "stats." + low + "-rls.bestSell"))
		if (Number.isFinite(rls) && rls > 0) {
			rate = rls / 10
			source = "NOBITEX"
		}
	} catch {
		// fall through to the next source
	}
	if (!rate) {
		try {
			const j = await getJson("https://api.wallex.ir/v1/markets")
			const tmn = toNumber(pickPath(j, "result.symbols." + sym + "TMN.stats.lastPrice"))
			if (Number.isFinite(tmn) && tmn > 0) {
				rate = tmn
				source = "WALLEX"
			}
		} catch {
			// handled below
		}
	}
	if (!rate) throw new AppError("قیمت لحطه‌ای " + sym + " در دسترس نیست؛ برای این ارز نرخ ثابت وارد کنید")
	await setSetting(cacheKey, coinCacheSchema, { rate, at: new Date().toISOString(), source })
	return { rate, source }
}

export async function assetRate(s: StoreSettings, asset: CryptoAsset): Promise<{ rate: number; source: string; auto: boolean; stale: boolean }> {
	const mode = effectiveRateMode(asset)
	if (mode === "FIXED") {
		if (asset.fixedRate <= 0) throw new AppError("نرخ ثابت " + asset.symbol + " تعیین نشده است")
		return { rate: withMargin(asset.fixedRate, asset.marginPct), source: "FIXED", auto: false, stale: false }
	}
	if (mode === "MARKET") {
		const m = await marketRate(asset.symbol)
		return { rate: withMargin(m.rate, asset.marginPct), source: m.source, auto: true, stale: false }
	}
	// stablecoin -> the seller's dollar rate, refreshed on demand by fx.ts
	const fx = await effectiveUsdtRate(s.adminId, s.usdtRate)
	if (fx.rate <= 0) throw new AppError("نرخ تتر تنظیم نشده و از منابع خودکار هم دریافت نشد")
	return { rate: withMargin(fx.rate, asset.marginPct), source: fx.source, auto: fx.auto, stale: fx.stale }
}

function decimalsFor(asset: CryptoAsset, rate: number): number {
	if (asset.decimals > 0) return asset.decimals
	if (rate >= 50_000_000) return 6
	if (rate >= 1_000_000) return 4
	return 2
}

export interface CryptoQuote {
	assetId: string
	symbol: string
	network: CryptoNetwork
	networkLabel: string
	address: string
	memo: string | null
	label: string | null
	/** IRT per 1 coin used for this quote */
	rateIrt: number
	/** coin amount the buyer has to send */
	amount: string
	decimals: number
	source: string
	auto: boolean
	stale: boolean
	at: string
}

export function coinAmount(amountIrt: bigint | number, rate: number, decimals: number): string {
	if (rate <= 0) return "0"
	const factor = 10 ** decimals
	const raw = Number(amountIrt) / rate
	const up = Math.ceil(raw * factor) / factor
	return Math.max(1 / factor, up).toFixed(decimals)
}

/** Freshly calculated amount for one wallet. */
export async function quoteAsset(s: StoreSettings, amountIrt: bigint, asset: CryptoAsset): Promise<CryptoQuote> {
	const r = await assetRate(s, asset)
	const decimals = decimalsFor(asset, r.rate)
	return {
		assetId: asset.id,
		symbol: asset.symbol.toUpperCase(),
		network: asset.network,
		networkLabel: CRYPTO_NETWORK_LABELS[asset.network] ?? asset.network,
		address: asset.address,
		memo: asset.memo || null,
		label: asset.label || null,
		rateIrt: r.rate,
		amount: coinAmount(amountIrt, r.rate, decimals),
		decimals,
		source: r.source,
		auto: r.auto,
		stale: r.stale,
		at: new Date().toISOString(),
	}
}

/** Quote for the wallet the buyer picked (or the first one). */
export async function quoteCrypto(s: StoreSettings, amountIrt: bigint, assetId?: string | null): Promise<CryptoQuote> {
	const assets = await availableAssets(s)
	if (!assets.length) throw new AppError("کیف‌پول ارز دیجیتال تنظیم نشده است")
	const asset = (assetId ? assets.find((a) => a.id === assetId) : null) ?? assets[0]!
	return quoteAsset(s, amountIrt, asset)
}

export interface CryptoOption {
	assetId: string
	symbol: string
	network: CryptoNetwork
	networkLabel: string
	label: string | null
	amount: string | null
	rateIrt: number | null
	error: string | null
}

/** Every wallet with its own freshly calculated amount (failures kept as an error row). */
export async function quoteOptions(s: StoreSettings, amountIrt: bigint): Promise<CryptoOption[]> {
	const assets = await availableAssets(s)
	const out: CryptoOption[] = []
	for (const a of assets) {
		const base = { assetId: a.id, symbol: a.symbol.toUpperCase(), network: a.network, networkLabel: CRYPTO_NETWORK_LABELS[a.network] ?? a.network, label: a.label || null }
		try {
			const q = await quoteAsset(s, amountIrt, a)
			out.push({ ...base, amount: q.amount, rateIrt: q.rateIrt, error: null })
		} catch (err) {
			out.push({ ...base, amount: null, rateIrt: null, error: err instanceof Error ? err.message : "قیمت‌گذاری ناموفق بود" })
		}
	}
	return out
}

/* ---------- payment snapshot ---------- */

/** The wallet snapshot stored on a payment, or null for legacy USDT payments. */
export function cryptoMetaOf(p: Pick<Payment, "meta">): CryptoQuote | null {
	const raw = (p.meta as { crypto?: unknown } | null)?.crypto
	if (!raw || typeof raw !== "object") return null
	const c = raw as Record<string, unknown>
	if (!c.address || !c.symbol) return null
	const network = (CRYPTO_NETWORKS as readonly string[]).includes(String(c.network)) ? (String(c.network) as CryptoNetwork) : "TRC20"
	return {
		assetId: String(c.assetId ?? ""),
		symbol: String(c.symbol).toUpperCase(),
		network,
		networkLabel: String(c.networkLabel ?? CRYPTO_NETWORK_LABELS[network] ?? network),
		address: String(c.address),
		memo: c.memo ? String(c.memo) : null,
		label: c.label ? String(c.label) : null,
		rateIrt: Number(c.rateIrt ?? 0),
		amount: String(c.amount ?? ""),
		decimals: Number(c.decimals ?? 2),
		source: String(c.source ?? ""),
		auto: !!c.auto,
		stale: !!c.stale,
		at: String(c.at ?? ""),
	}
}

/** Only USDT on Tron can be verified automatically (see tron.ts). */
export function isTrc20Usdt(q: CryptoQuote | null): boolean {
	return !q || (q.symbol === "USDT" && q.network === "TRC20")
}

/* ---------- buyer switching the coin on an open order ---------- */

async function openCryptoPayment(token: string) {
	const order = await prisma.order.findUnique({
		where: { token },
		include: { payments: { where: { method: "USDT" }, orderBy: { createdAt: "desc" }, take: 1 } },
	})
	if (!order) throw new NotFoundError("سفارش پیدا نشد")
	const s = await storeSettingsByAdminId(order.adminId)
	if (!s) throw new AppError("تنظیمات فروشگاه پیدا نشد")
	return { order, payment: order.payments[0] ?? null, s }
}

/** Coin list + amounts for a public order page. */
export async function orderCryptoOptions(token: string): Promise<{ options: CryptoOption[]; selected: string | null; editable: boolean }> {
	const { order, payment, s } = await openCryptoPayment(token)
	const options = await quoteOptions(s, order.amount)
	const meta = payment ? cryptoMetaOf(payment) : null
	const editable = !!payment && payment.status === "PENDING" && (!payment.expiresAt || payment.expiresAt.getTime() > Date.now())
	return { options, selected: meta?.assetId ?? options[0]?.assetId ?? null, editable }
}

/** Re-quotes an open crypto payment onto another coin/network. */
export async function selectOrderAsset(token: string, assetId: string): Promise<CryptoQuote> {
	const { order, payment, s } = await openCryptoPayment(token)
	if (!payment) throw new AppError("پرداخت ارزی بازی برای این سفارش وجود ندارد")
	if (payment.status !== "PENDING") throw new AppError("این پرداخت دیگر قابل تغییر نیست")
	if (payment.expiresAt && payment.expiresAt.getTime() < Date.now()) throw new AppError("مهلت پرداخت تمام شده است")
	const quote = await quoteCrypto(s, order.amount, assetId)
	await prisma.payment.update({
		where: { id: payment.id },
		data: { amountUsdt: quote.amount, error: null, meta: { ...((payment.meta as object) ?? {}), crypto: quote } as any },
	})
	return quote
}
