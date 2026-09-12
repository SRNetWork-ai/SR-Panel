import { prisma } from "@srpanel/db"
import { z } from "zod"
import { getSetting, setSetting } from "./settings"

/**
 * Automatic currency pricing (USDT -> IRT).
 *
 * The seller picks an ordered list of public price sources. Every refresh walks
 * the list from top to bottom and stops at the first source that answers with a
 * plausible number, so a single dead API never breaks the storefront. The
 * result is cached (per seller) and mirrored into StoreSettings.usdtRate, which
 * means the whole payment pipeline keeps working untouched.
 *
 * Settings live in the generic `Setting` key/value table -> no DB migration.
 */

export const FX_SOURCES = ["NOBITEX", "WALLEX", "BITPIN", "TETHERLAND", "RAMZINEX", "CUSTOM"] as const
export type FxSource = (typeof FX_SOURCES)[number]

export const FX_SOURCE_LABELS: Record<FxSource, string> = {
	NOBITEX: "نوبیتکس",
	WALLEX: "والکس",
	BITPIN: "بیت‌پین",
	TETHERLAND: "تترلند",
	RAMZINEX: "رمزینکس",
	CUSTOM: "API سفارشی",
}

export const fxSettingsSchema = z.object({
	/** MANUAL = seller types the rate, AUTO = fetched from the sources below */
	mode: z.enum(["MANUAL", "AUTO"]).default("MANUAL"),
	sources: z.array(z.enum(FX_SOURCES)).max(12).default(["NOBITEX", "WALLEX", "BITPIN"]),
	/** profit/safety margin in percent, may be negative */
	marginPct: z.number().min(-50).max(200).default(2),
	/** round the final rate to this step (IRT), 0 = no rounding */
	roundTo: z.number().int().min(0).max(1_000_000).default(500),
	ttlMin: z.number().int().min(1).max(1440).default(10),
	minRate: z.number().int().min(0).max(100_000_000).default(0),
	maxRate: z.number().int().min(0).max(100_000_000).default(0),
	customUrl: z.string().trim().max(500).default(""),
	/** dot path inside the custom JSON response, e.g. `data.price` */
	customPath: z.string().trim().max(200).default(""),
	customUnit: z.enum(["IRT", "IRR"]).default("IRT"),
	cacheRate: z.number().int().min(0).default(0),
	cacheAt: z.string().max(40).default(""),
	cacheSource: z.string().max(40).default(""),
	lastError: z.string().max(400).default(""),
})
export type FxSettings = z.infer<typeof fxSettingsSchema>

const fxKey = (adminId: string) => `store:fx:${adminId}`

export const fxSettings = (adminId: string) => getSetting(fxKey(adminId), fxSettingsSchema, 5_000)

export async function saveFxSettings(adminId: string, patch: Partial<FxSettings>): Promise<FxSettings> {
	const current = await fxSettings(adminId)
	return setSetting(fxKey(adminId), fxSettingsSchema, { ...current, ...patch })
}

/* ---------- helpers ---------- */

const TIMEOUT_MS = 6_000
/** sanity window for "toman per USDT" so a broken API can never poison prices */
const MIN_PLAUSIBLE = 5_000
const MAX_PLAUSIBLE = 20_000_000

async function getJson(url: string, headers?: Record<string, string>): Promise<unknown> {
	const ac = new AbortController()
	const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
	try {
		const res = await fetch(url, {
			signal: ac.signal,
			cache: "no-store",
			headers: { accept: "application/json", "user-agent": "SRPanel/1.0", ...(headers ?? {}) },
		})
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		return (await res.json()) as unknown
	} finally {
		clearTimeout(timer)
	}
}

/** tolerant number parser: "1,053,000" / "1053000.5" / 1053000 */
export function toNumber(v: unknown): number {
	if (typeof v === "number") return Number.isFinite(v) ? v : NaN
	if (typeof v === "string") {
		const n = Number(v.replace(/[^0-9.\-]/g, ""))
		return Number.isFinite(n) ? n : NaN
	}
	return NaN
}

/** `a.b[0].c` style lookup used by the custom source */
export function pickPath(obj: unknown, path: string): unknown {
	return path
		.split(/[.[\]]+/)
		.filter(Boolean)
		.reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj)
}

/** last resort for unknown shapes: first plausible number anywhere in the payload */
function deepFindRate(v: unknown, depth = 0): number {
	if (depth > 5) return NaN
	const n = toNumber(v)
	if (Number.isFinite(n) && n >= MIN_PLAUSIBLE && n <= MAX_PLAUSIBLE * 10) return n
	if (Array.isArray(v)) {
		for (const item of v) {
			const found = deepFindRate(item, depth + 1)
			if (Number.isFinite(found)) return found
		}
		return NaN
	}
	if (v && typeof v === "object") {
		for (const key of ["price", "last", "latest", "sell", "buy", "value", "rate", "lastPrice", "close"]) {
			const found = deepFindRate((v as Record<string, unknown>)[key], depth + 1)
			if (Number.isFinite(found)) return found
		}
		for (const item of Object.values(v as Record<string, unknown>)) {
			const found = deepFindRate(item, depth + 1)
			if (Number.isFinite(found)) return found
		}
	}
	return NaN
}

/* ---------- providers (every one returns IRT/toman per 1 USDT) ---------- */

type Provider = { id: FxSource; fetchRate: (s: FxSettings) => Promise<number> }

const PROVIDERS: Provider[] = [
	{
		id: "NOBITEX",
		fetchRate: async () => {
			const j = await getJson("https://api.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls")
			const rls = toNumber(pickPath(j, "stats.usdt-rls.latest") ?? pickPath(j, "stats.usdt-rls.bestSell"))
			if (!Number.isFinite(rls)) throw new Error("پاسخ نامعتبر نوبیتکس")
			return rls / 10
		},
	},
	{
		id: "WALLEX",
		fetchRate: async () => {
			const j = await getJson("https://api.wallex.ir/v1/markets")
			const tmn = toNumber(pickPath(j, "result.symbols.USDTTMN.stats.lastPrice") ?? pickPath(j, "result.symbols.USDTTMN.stats.bidPrice"))
			if (!Number.isFinite(tmn)) throw new Error("پاسخ نامعتبر والکس")
			return tmn
		},
	},
	{
		id: "BITPIN",
		fetchRate: async () => {
			let j: unknown
			try {
				j = await getJson("https://api.bitpin.ir/v1/mkt/markets/")
			} catch {
				j = await getJson("https://api.bitpin.org/v1/mkt/markets/")
			}
			const rows = (Array.isArray(j) ? j : ((j as Record<string, unknown>)?.results as unknown[]) ?? []) as Array<Record<string, unknown>>
			const row = rows.find((r) => String(r.code ?? "").toUpperCase() === "USDT_IRT")
			if (!row) throw new Error("بازار USDT_IRT در بیت‌پین پیدا نشد")
			const tmn = toNumber(row.price ?? row.last ?? row.price_info)
			if (!Number.isFinite(tmn)) throw new Error("پاسخ نامعتبر بیت‌پین")
			return tmn
		},
	},
	{
		id: "TETHERLAND",
		fetchRate: async () => {
			const j = await getJson("https://api.tetherland.com/currencies")
			const tmn = toNumber(pickPath(j, "data.currencies.USDT.price"))
			if (!Number.isFinite(tmn)) throw new Error("پاسخ نامعتبر تترلند")
			return tmn
		},
	},
	{
		id: "RAMZINEX",
		fetchRate: async () => {
			const j = await getJson("https://publicapi.ramzinex.com/exchange/api/v1.0/exchange/pairs")
			const rows = (Array.isArray(j) ? j : ((j as Record<string, unknown>)?.data as unknown[]) ?? []) as Array<Record<string, unknown>>
			const row = rows.find((r) => {
				const base = JSON.stringify(r.base_currency_symbol ?? "").toLowerCase()
				const quote = JSON.stringify(r.quote_currency_symbol ?? "").toLowerCase()
				return base.includes("usdt") && (quote.includes("irr") || quote.includes("rial") || quote.includes("ریال"))
			})
			if (!row) throw new Error("جفت‌ارز USDT/IRR در رمزینکس پیدا نشد")
			const rls = toNumber(row.sell ?? row.buy ?? row.last)
			if (!Number.isFinite(rls)) throw new Error("پاسخ نامعتبر رمزینکس")
			return rls / 10
		},
	},
	{
		id: "CUSTOM",
		fetchRate: async (s) => {
			if (!s.customUrl) throw new Error("آدرس API سفارشی وارد نشده است")
			if (!/^https?:\/\//i.test(s.customUrl)) throw new Error("آدرس API سفارشی باید با http(s) شروع شود")
			const j = await getJson(s.customUrl)
			const raw = s.customPath ? toNumber(pickPath(j, s.customPath)) : deepFindRate(j)
			if (!Number.isFinite(raw)) throw new Error("مقدار نرخ در پاسخ API سفارشی پیدا نشد")
			return s.customUnit === "IRR" ? raw / 10 : raw
		},
	},
]

/* ---------- refresh pipeline ---------- */

export interface FxAttempt {
	source: FxSource
	ok: boolean
	rate?: number
	error?: string
}

export interface FxResult {
	rate: number
	source: string
	at: string
	attempts: FxAttempt[]
}

export function applyMargin(raw: number, s: Pick<FxSettings, "marginPct" | "roundTo" | "minRate" | "maxRate">): number {
	let v = raw * (1 + (s.marginPct || 0) / 100)
	if (s.roundTo > 0) v = Math.round(v / s.roundTo) * s.roundTo
	v = Math.max(0, Math.round(v))
	if (s.minRate > 0) v = Math.max(v, s.minRate)
	if (s.maxRate > 0) v = Math.min(v, s.maxRate)
	return v
}

/** Walks the configured sources in order and returns the first plausible rate. */
export async function fetchUsdtRate(s: FxSettings): Promise<FxResult> {
	const attempts: FxAttempt[] = []
	const order = (s.sources.length ? s.sources : ["NOBITEX", "WALLEX"]) as FxSource[]
	for (const id of order) {
		const provider = PROVIDERS.find((p) => p.id === id)
		if (!provider) continue
		try {
			const raw = await provider.fetchRate(s)
			if (!Number.isFinite(raw) || raw < MIN_PLAUSIBLE || raw > MAX_PLAUSIBLE) throw new Error(`نرخ غیرمنتظره: ${Math.round(raw)}`)
			const rate = applyMargin(raw, s)
			attempts.push({ source: id, ok: true, rate })
			return { rate, source: id, at: new Date().toISOString(), attempts }
		} catch (err) {
			attempts.push({ source: id, ok: false, error: err instanceof Error ? err.message : "خطای نامشخص" })
		}
	}
	return { rate: 0, source: "", at: new Date().toISOString(), attempts }
}

export function isFxFresh(s: FxSettings): boolean {
	if (!s.cacheRate || !s.cacheAt) return false
	const at = Date.parse(s.cacheAt)
	if (!Number.isFinite(at)) return false
	return Date.now() - at < s.ttlMin * 60_000
}

export interface FxStatus extends FxResult {
	mode: FxSettings["mode"]
	stale: boolean
	error: string | null
}

/**
 * Refreshes the cached rate when needed and mirrors it into StoreSettings so
 * `beginPayment` / `paymentNext` keep using a single source of truth.
 */
export async function refreshUsdtRate(adminId: string, opts: { force?: boolean } = {}): Promise<FxStatus> {
	const s = await fxSettings(adminId)
	const cached: FxStatus = { rate: s.cacheRate, source: s.cacheSource, at: s.cacheAt, attempts: [], mode: s.mode, stale: !isFxFresh(s), error: s.lastError || null }
	if (s.mode !== "AUTO" && !opts.force) return cached
	if (!opts.force && isFxFresh(s)) return { ...cached, stale: false }
	const r = await fetchUsdtRate(s)
	if (!r.rate) {
		const error = r.attempts.map((a) => `${FX_SOURCE_LABELS[a.source] ?? a.source}: ${a.error ?? "—"}`).join(" • ").slice(0, 400)
		await saveFxSettings(adminId, { lastError: error })
		return { ...cached, attempts: r.attempts, stale: true, error }
	}
	await saveFxSettings(adminId, { cacheRate: r.rate, cacheAt: r.at, cacheSource: r.source, lastError: "" })
	await prisma.storeSettings.updateMany({ where: { adminId }, data: { usdtRate: r.rate } }).catch(() => undefined)
	return { ...r, mode: s.mode, stale: false, error: null }
}

/** Rate the storefront should quote right now (manual value stays authoritative in MANUAL mode). */
export async function effectiveUsdtRate(adminId: string, manualRate: number): Promise<{ rate: number; source: string; at: string | null; auto: boolean; stale: boolean }> {
	const s = await fxSettings(adminId)
	if (s.mode !== "AUTO") return { rate: manualRate, source: "MANUAL", at: null, auto: false, stale: false }
	if (isFxFresh(s)) return { rate: s.cacheRate, source: s.cacheSource || "AUTO", at: s.cacheAt || null, auto: true, stale: false }
	const r = await refreshUsdtRate(adminId).catch(() => null)
	if (r && r.rate > 0) return { rate: r.rate, source: r.source || s.cacheSource || "AUTO", at: r.at || null, auto: true, stale: !!r.stale }
	const fallback = s.cacheRate > 0 ? s.cacheRate : manualRate
	return { rate: fallback, source: s.cacheSource || "MANUAL", at: s.cacheAt || null, auto: true, stale: true }
}

/** Worker job: refresh every seller that opted into automatic pricing. */
export async function autoRefreshRates(): Promise<number> {
	const rows = await prisma.setting.findMany({ where: { key: { startsWith: "store:fx:" } }, select: { key: true, value: true } })
	let updated = 0
	for (const row of rows) {
		const parsed = fxSettingsSchema.safeParse(row.value ?? {})
		if (!parsed.success || parsed.data.mode !== "AUTO" || isFxFresh(parsed.data)) continue
		const adminId = row.key.slice("store:fx:".length)
		if (!adminId) continue
		const r = await refreshUsdtRate(adminId).catch(() => null)
		if (r && r.rate > 0 && !r.stale) updated++
	}
	return updated
}
