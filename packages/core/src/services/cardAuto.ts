import { prisma } from "@srpanel/db"
import { randomBytes } from "node:crypto"
import { z } from "zod"
import { decryptSecret, encryptSecret } from "../crypto/secretbox"
import { toNumber } from "./fx"
import { confirmPayment } from "./payments"
import { getSetting, panelUrl, setSetting } from "./settings"

/**
 * Automatic confirmation for card-to-card (کارت به کارت) payments.
 *
 * Two independent feeds, both optional:
 *  1. SMS  — the seller forwards bank deposit SMS to a private webhook URL
 *            (any "SMS forwarder" app on Android can POST to it).
 *  2. BANK — a JSON endpoint (همراه‌بانک bridge / custom scraper) is polled and
 *            its deposit rows are imported.
 *
 * Every imported deposit is matched against the seller's PENDING/REVIEW card
 * payments by amount (+ optional tolerance, last-4 and reference id). A single
 * unambiguous match is confirmed through `confirmPayment(..., { auto: true })`,
 * so wallet/order fulfilment keeps its existing behaviour. Ambiguous or
 * unmatched deposits are kept in a small ring buffer for manual review.
 *
 * Everything is stored in the generic `Setting` key/value table -> no migration.
 */

export const CARD_VERIFY_MODES = ["MANUAL", "SMS", "BANK"] as const
export type CardVerifyMode = (typeof CARD_VERIFY_MODES)[number]

export const CARD_VERIFY_LABELS: Record<CardVerifyMode, string> = {
	MANUAL: "تأیید دستی",
	SMS: "پیامک واریز بانک",
	BANK: "اتصال به بانک",
}

export const BANK_PROVIDERS = ["NONE", "HAMRAHBANK", "CUSTOM"] as const
export type BankProvider = (typeof BANK_PROVIDERS)[number]

export const BANK_PROVIDER_LABELS: Record<BankProvider, string> = {
	NONE: "غیرفعال",
	HAMRAHBANK: "همراه‌بانک (پل واسط)",
	CUSTOM: "API سفارشی",
}

export const DEPOSIT_STATUSES = ["MATCHED", "UNMATCHED", "AMBIGUOUS", "DUPLICATE", "IGNORED"] as const

export const depositSchema = z.object({
	id: z.string().max(40).default(""),
	at: z.string().max(40).default(""),
	amount: z.number().default(0),
	refId: z.string().max(60).default(""),
	last4: z.string().max(8).default(""),
	sender: z.string().max(60).default(""),
	raw: z.string().max(400).default(""),
	source: z.enum(["SMS", "BANK", "MANUAL"]).default("SMS"),
	status: z.enum(DEPOSIT_STATUSES).default("UNMATCHED"),
	paymentId: z.string().max(40).default(""),
	note: z.string().max(200).default(""),
})
export type Deposit = z.infer<typeof depositSchema>

export const cardAutoSchema = z.object({
	mode: z.enum(CARD_VERIFY_MODES).default("MANUAL"),
	/** confirm automatically when exactly one payment matches */
	autoConfirm: z.boolean().default(true),
	/** add a few toman to each order so two buyers never share one amount */
	uniqueAmount: z.boolean().default(true),
	/** how far back a deposit may be matched (minutes) */
	windowMin: z.number().int().min(5).max(1440).default(120),
	/** accepted difference between deposit and invoice (toman) */
	toleranceIrt: z.number().int().min(0).max(100_000).default(0),
	requireLast4: z.boolean().default(false),
	smsToken: z.string().max(80).default(""),
	/** allowed SMS senders (bank numbers); empty = accept all */
	senders: z.array(z.string().max(60)).max(20).default([]),
	bankProvider: z.enum(BANK_PROVIDERS).default("NONE"),
	bankApiUrl: z.string().trim().max(500).default(""),
	bankUsername: z.string().trim().max(120).default(""),
	bankSecretEnc: z.string().max(2000).default(""),
	bankCard: z.string().trim().max(32).default(""),
	bankPollMin: z.number().int().min(1).max(240).default(5),
	bankLastSyncAt: z.string().max(40).default(""),
	lastError: z.string().max(400).default(""),
	deposits: z.array(depositSchema).max(60).default([]),
})
export type CardAutoSettings = z.infer<typeof cardAutoSchema>

const RING = 40
const cardKey = (adminId: string) => `store:card:${adminId}`
const hookKey = (token: string) => `store:smsHook:${token}`
const hookSchema = z.object({ adminId: z.string().max(60).default("") })

export const cardAutoSettings = (adminId: string) => getSetting(cardKey(adminId), cardAutoSchema, 5_000)

export async function saveCardAuto(adminId: string, patch: Partial<CardAutoSettings>): Promise<CardAutoSettings> {
	const current = await cardAutoSettings(adminId)
	return setSetting(cardKey(adminId), cardAutoSchema, { ...current, ...patch })
}

export async function setBankSecret(adminId: string, plain: string | null | undefined): Promise<CardAutoSettings> {
	if (plain === undefined) return cardAutoSettings(adminId)
	const value = (plain ?? "").trim()
	return saveCardAuto(adminId, { bankSecretEnc: value ? encryptSecret(value) : "" })
}

function bankSecret(s: CardAutoSettings): string {
	if (!s.bankSecretEnc) return ""
	try {
		return decryptSecret(s.bankSecretEnc)
	} catch {
		return ""
	}
}

export function webhookUrlFor(token: string): string {
	return `${panelUrl()}/api/hooks/deposit/${token}`
}

export interface CardAutoDto extends Omit<CardAutoSettings, "bankSecretEnc"> {
	hasBankSecret: boolean
	webhookUrl: string
}

export function toCardAutoDto(s: CardAutoSettings): CardAutoDto {
	const rest = { ...s } as Record<string, unknown>
	delete rest.bankSecretEnc
	return {
		...(rest as Omit<CardAutoSettings, "bankSecretEnc">),
		hasBankSecret: !!s.bankSecretEnc,
		webhookUrl: s.smsToken ? webhookUrlFor(s.smsToken) : "",
	}
}

/* ---------- webhook token ---------- */

export async function rotateSmsToken(adminId: string): Promise<string> {
	const prev = await cardAutoSettings(adminId)
	const token = randomBytes(18).toString("base64url")
	if (prev.smsToken) await setSetting(hookKey(prev.smsToken), hookSchema, { adminId: "" }).catch(() => undefined)
	await setSetting(hookKey(token), hookSchema, { adminId })
	await saveCardAuto(adminId, { smsToken: token })
	return token
}

export async function ensureSmsToken(adminId: string): Promise<string> {
	const s = await cardAutoSettings(adminId)
	if (s.smsToken) {
		await setSetting(hookKey(s.smsToken), hookSchema, { adminId }).catch(() => undefined)
		return s.smsToken
	}
	return rotateSmsToken(adminId)
}

/** Resolves the public webhook token back to its owner (and rejects stale tokens). */
export async function adminByDepositToken(token: string): Promise<string | null> {
	const t = String(token ?? "").trim()
	if (t.length < 12) return null
	const row = await getSetting(hookKey(t), hookSchema, 5_000)
	if (!row.adminId) return null
	const s = await cardAutoSettings(row.adminId)
	return s.smsToken === t ? row.adminId : null
}

/* ---------- SMS parsing ---------- */

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"

/** Converts Persian/Arabic digits and separators to ASCII. */
export function normalizeDigits(input: string): string {
	let out = ""
	for (const ch of String(input ?? "")) {
		const fa = FA_DIGITS.indexOf(ch)
		if (fa >= 0) {
			out += String(fa)
			continue
		}
		const ar = AR_DIGITS.indexOf(ch)
		out += ar >= 0 ? String(ar) : ch
	}
	return out.replace(/[\u066B\u066C]/g, ",")
}

const DEPOSIT_WORDS = ["واریز", "واريز", "بستانکار", "بستانكار", "افزایش", "credit", "deposit"]
const WITHDRAW_WORDS = ["برداشت", "بدهکار", "بدهكار", "خرید", "خريد", "انتقال از", "کاهش", "debit", "withdraw", "قسط"]

export interface ParsedSms {
	amount: number
	refId: string
	last4: string
	kind: "DEPOSIT" | "WITHDRAW" | "UNKNOWN"
}

/**
 * Extracts amount / reference / card tail from a bank deposit SMS.
 * Balance figures (مانده، موجودی) are stripped first so they never win.
 */
export function parseDepositSms(body: string): ParsedSms | null {
	const text = normalizeDigits(body).replace(/\u200c/g, "").trim()
	if (!text) return null
	const kind: ParsedSms["kind"] = DEPOSIT_WORDS.some((w) => text.includes(w))
		? "DEPOSIT"
		: WITHDRAW_WORDS.some((w) => text.includes(w))
			? "WITHDRAW"
			: "UNKNOWN"
	const cleaned = text.replace(/(مانده|مانده حساب|موجودی|موجودي|balance|bal)\s*[:=\-،]?\s*[\d,.]+/gi, " ")
	const rial = /ریال|ريال|rial|rls|irr/i.test(text)
	const near = cleaned.match(/(?:واریز|واريز|بستانکار|بستانكار|credit|deposit)\s*[:=\-،]?\s*([\d,]{4,})/i)
	let amount = near ? toNumber(near[1]) : NaN
	if (!Number.isFinite(amount) || amount < 1000) {
		const all = (cleaned.match(/\d[\d,]{3,}/g) ?? []).map(toNumber).filter((n) => Number.isFinite(n) && n >= 1000)
		amount = all.length ? Math.max(...all) : NaN
	}
	if (!Number.isFinite(amount) || amount <= 0) return { amount: 0, refId: "", last4: "", kind }
	if (rial) amount = Math.round(amount / 10)
	const ref = text.match(/(?:پیگیری|پيگيري|رهگیری|رهگيري|شناسه|مرجع|ref|refid|reference|tracking)\s*[:=\-#،]?\s*(\d{4,20})/i)
	const tail = text.match(/(?:\*|x|X|•){2,}\s*[-\s]?\s*(\d{4})/) ?? text.match(/کارت\s*[:\-]?\s*\d{0,6}\D{0,6}(\d{4})\b/)
	return {
		amount: Math.round(amount),
		refId: ref ? ref[1] : "",
		last4: tail ? tail[1] : "",
		kind,
	}
}

/* ---------- matching ---------- */

export interface MatchResult {
	status: Deposit["status"]
	paymentId: string
	note: string
}

const digitsOnly = (v: string) => String(v ?? "").replace(/\D/g, "")

export async function matchDeposit(adminId: string, s: CardAutoSettings, dep: Pick<Deposit, "amount" | "last4" | "refId">): Promise<MatchResult> {
	if (!dep.amount || dep.amount <= 0) return { status: "IGNORED", paymentId: "", note: "مبلغ نامعتبر" }
	const since = new Date(Date.now() - Math.max(5, s.windowMin) * 60_000)
	const rows = await prisma.payment.findMany({
		where: { adminId, method: "CARD", status: { in: ["PENDING", "REVIEW"] }, createdAt: { gte: since } },
		orderBy: { createdAt: "desc" },
		take: 200,
		select: { id: true, amount: true, cardPan: true, receiptRef: true },
	})
	if (!rows.length) return { status: "UNMATCHED", paymentId: "", note: "پرداخت کارت‌به‌کارتی در انتظار وجود ندارد" }
	const tol = Math.max(0, s.toleranceIrt)
	let cands = rows.filter((r) => Math.abs(Number(r.amount) - dep.amount) <= tol)
	if (dep.refId) {
		const byRef = rows.filter((r) => r.receiptRef && digitsOnly(r.receiptRef) === digitsOnly(dep.refId))
		if (byRef.length === 1) cands = byRef
	}
	if (s.requireLast4 && dep.last4 && cands.length > 1) {
		const byTail = cands.filter((r) => (r.cardPan ?? "").slice(-4) === dep.last4)
		cands = byTail.length ? byTail : []
	}
	if (!cands.length) return { status: "UNMATCHED", paymentId: "", note: `مبلغ ${dep.amount.toLocaleString("en-US")} با هیچ سفارشی مطابقت نداشت` }
	if (cands.length > 1) return { status: "AMBIGUOUS", paymentId: "", note: `${cands.length} سفارش با این مبلغ در انتظار است؛ تأیید دستی لازم است` }
	const target = cands[0]
	if (!s.autoConfirm) return { status: "UNMATCHED", paymentId: target.id, note: "سفارش متناظر پیدا شد اما تأیید خودکار خاموش است" }
	try {
		await confirmPayment(target.id, {
			auto: true,
			refId: dep.refId || null,
			note: `تأیید خودکار کارت‌به‌کارت — واریز ${dep.amount.toLocaleString("en-US")} تومان${dep.refId ? ` / پیگیری ${dep.refId}` : ""}`,
			...(dep.last4 ? { cardPan: dep.last4 } : {}),
		} as any)
		return { status: "MATCHED", paymentId: target.id, note: "پرداخت به‌صورت خودکار تأیید شد" }
	} catch (err) {
		return { status: "UNMATCHED", paymentId: target.id, note: err instanceof Error ? err.message : "تأیید خودکار ناموفق بود" }
	}
}

/* ---------- ingest ---------- */

export interface DepositInput {
	amount: number
	refId?: string | null
	last4?: string | null
	sender?: string | null
	raw?: string | null
	at?: string | null
	source?: Deposit["source"]
}

export interface IngestResult {
	ok: boolean
	status: Deposit["status"]
	paymentId: string | null
	message: string
	deposit: Deposit | null
}

function fingerprint(d: Pick<Deposit, "amount" | "refId" | "raw">): string {
	return d.refId ? `r:${digitsOnly(d.refId)}` : `a:${d.amount}:${(d.raw ?? "").replace(/\s+/g, "").slice(0, 60)}`
}

/** Imports one deposit, dedupes it, tries to match it and stores the result. */
export async function ingestDeposit(adminId: string, input: DepositInput): Promise<IngestResult> {
	const amount = Math.round(toNumber(input.amount as unknown))
	if (!Number.isFinite(amount) || amount <= 0) return { ok: false, status: "IGNORED", paymentId: null, message: "مبلغ واریز نامعتبر است", deposit: null }
	const s = await cardAutoSettings(adminId)
	const dep: Deposit = {
		id: randomBytes(6).toString("hex"),
		at: input.at && !Number.isNaN(Date.parse(input.at)) ? new Date(input.at).toISOString() : new Date().toISOString(),
		amount,
		refId: digitsOnly(input.refId ?? "").slice(0, 40),
		last4: digitsOnly(input.last4 ?? "").slice(-4),
		sender: (input.sender ?? "").toString().slice(0, 60),
		raw: (input.raw ?? "").toString().slice(0, 400),
		source: input.source ?? "SMS",
		status: "UNMATCHED",
		paymentId: "",
		note: "",
	}
	const fp = fingerprint(dep)
	const dup = s.deposits.find((d) => fingerprint(d) === fp || (d.amount === dep.amount && Math.abs(Date.parse(d.at) - Date.parse(dep.at)) < 120_000))
	if (dup) return { ok: false, status: "DUPLICATE", paymentId: dup.paymentId || null, message: "این واریز قبلاً ثبت شده است", deposit: dup }
	const m = await matchDeposit(adminId, s, dep)
	dep.status = m.status
	dep.paymentId = m.paymentId
	dep.note = m.note
	await saveCardAuto(adminId, { deposits: [dep, ...s.deposits].slice(0, RING), lastError: "" })
	return { ok: m.status === "MATCHED", status: m.status, paymentId: m.paymentId || null, message: m.note, deposit: dep }
}

/** Webhook entry point: raw SMS body -> deposit. */
export async function ingestSmsText(adminId: string, body: string, sender?: string | null): Promise<IngestResult> {
	const parsed = parseDepositSms(body)
	if (!parsed) return { ok: false, status: "IGNORED", paymentId: null, message: "متن پیامک خالی است", deposit: null }
	if (parsed.kind === "WITHDRAW") return { ok: false, status: "IGNORED", paymentId: null, message: "پیامک برداشت است، نه واریز", deposit: null }
	if (!parsed.amount) return { ok: false, status: "IGNORED", paymentId: null, message: "مبلغ در متن پیامک پیدا نشد", deposit: null }
	const s = await cardAutoSettings(adminId)
	const from = (sender ?? "").toString().trim()
	if (s.senders.length && from && !s.senders.some((x) => digitsOnly(x) && digitsOnly(from).includes(digitsOnly(x)))) {
		return { ok: false, status: "IGNORED", paymentId: null, message: `فرستنده ${from} در فهرست مجاز نیست`, deposit: null }
	}
	return ingestDeposit(adminId, { amount: parsed.amount, refId: parsed.refId, last4: parsed.last4, sender: from, raw: body, source: "SMS" })
}

/** Re-runs matching for deposits that are still open (after a new order arrives). */
export async function rematchDeposits(adminId: string): Promise<{ matched: number }> {
	const s = await cardAutoSettings(adminId)
	const open = s.deposits.filter((d) => d.status === "UNMATCHED" || d.status === "AMBIGUOUS")
	if (!open.length) return { matched: 0 }
	let matched = 0
	const next = [...s.deposits]
	for (const d of open.slice(0, 15)) {
		const m = await matchDeposit(adminId, s, d)
		const i = next.findIndex((x) => x.id === d.id)
		if (i < 0) continue
		next[i] = { ...d, status: m.status, paymentId: m.paymentId, note: m.note }
		if (m.status === "MATCHED") matched++
	}
	await saveCardAuto(adminId, { deposits: next })
	return { matched }
}

/**
 * Gives every open card invoice a distinct amount (base + 0..999 toman) so a
 * deposit can be matched to exactly one buyer.
 */
export async function uniqueCardAmount(adminId: string, amount: number): Promise<number> {
	const base = Math.round(amount)
	if (!Number.isFinite(base) || base <= 0) return base
	const s = await cardAutoSettings(adminId)
	if (!s.uniqueAmount || s.mode === "MANUAL") return base
	const since = new Date(Date.now() - Math.max(5, s.windowMin) * 60_000)
	const rows = await prisma.payment.findMany({
		where: { adminId, method: "CARD", status: { in: ["PENDING", "REVIEW"] }, createdAt: { gte: since } },
		select: { amount: true },
		take: 500,
	})
	if (!rows.length) return base
	const taken = rows.map((r) => Number(r.amount))
	const step = Math.max(1, s.toleranceIrt + 1)
	for (let i = 0; i <= 999; i += step) {
		const candidate = base + i
		if (!taken.some((t) => Math.abs(t - candidate) <= s.toleranceIrt)) return candidate
	}
	return base
}

/* ---------- bank bridge ---------- */

export interface BankSyncResult {
	ok: boolean
	fetched: number
	imported: number
	matched: number
	error: string | null
}

function rowsOf(j: unknown): Array<Record<string, unknown>> {
	if (Array.isArray(j)) return j as Array<Record<string, unknown>>
	if (j && typeof j === "object") {
		for (const key of ["data", "items", "records", "transactions", "result", "rows", "list"]) {
			const v = (j as Record<string, unknown>)[key]
			if (Array.isArray(v)) return v as Array<Record<string, unknown>>
			if (v && typeof v === "object") {
				const inner = rowsOf(v)
				if (inner.length) return inner
			}
		}
	}
	return []
}

const pick = (r: Record<string, unknown>, keys: string[]): unknown => {
	for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== "") return r[k]
	return undefined
}

/**
 * Polls the configured bank endpoint and imports its deposit rows.
 * همراه‌بانک has no public API, so this expects a small bridge/scraper that
 * exposes the statement as JSON (any shape with amount + reference fields).
 */
export async function syncBankDeposits(adminId: string): Promise<BankSyncResult> {
	const s = await cardAutoSettings(adminId)
	if (s.bankProvider === "NONE" || !s.bankApiUrl) return { ok: false, fetched: 0, imported: 0, matched: 0, error: "آدرس سرویس بانک تنظیم نشده است" }
	if (!/^https?:\/\//i.test(s.bankApiUrl)) return { ok: false, fetched: 0, imported: 0, matched: 0, error: "آدرس سرویس بانک باید با http(s) شروع شود" }
	const secret = bankSecret(s)
	const headers: Record<string, string> = { accept: "application/json", "user-agent": "SRPanel/1.0" }
	if (s.bankUsername && secret) headers.authorization = `Basic ${Buffer.from(`${s.bankUsername}:${secret}`).toString("base64")}`
	else if (secret) headers.authorization = `Bearer ${secret}`
	if (s.bankCard) headers["x-card"] = s.bankCard
	const ac = new AbortController()
	const timer = setTimeout(() => ac.abort(), 10_000)
	let payload: unknown
	try {
		const res = await fetch(s.bankApiUrl, { headers, cache: "no-store", signal: ac.signal })
		if (!res.ok) throw new Error(`HTTP ${res.status}`)
		payload = await res.json()
	} catch (err) {
		const error = err instanceof Error ? err.message : "اتصال به سرویس بانک ناموفق بود"
		await saveCardAuto(adminId, { lastError: error, bankLastSyncAt: new Date().toISOString() })
		return { ok: false, fetched: 0, imported: 0, matched: 0, error }
	} finally {
		clearTimeout(timer)
	}
	const rows = rowsOf(payload)
	let imported = 0
	let matched = 0
	for (const row of rows.slice(0, 30)) {
		const desc = String(pick(row, ["type", "kind", "desc", "description", "title", "sharh"]) ?? "")
		if (WITHDRAW_WORDS.some((w) => desc.includes(w)) || /debit|withdraw/i.test(desc)) continue
		let amount = toNumber(pick(row, ["amount", "credit", "deposit", "mablagh", "value", "price", "bestankar"]))
		if (!Number.isFinite(amount) || amount <= 0) continue
		const unit = String(pick(row, ["currency", "unit", "vahed"]) ?? "")
		if (/irr|rial|ریال|ريال/i.test(unit)) amount = Math.round(amount / 10)
		const r = await ingestDeposit(adminId, {
			amount,
			refId: String(pick(row, ["refId", "ref", "reference", "trackingCode", "followCode", "peygiri", "id", "seq"]) ?? ""),
			last4: String(pick(row, ["cardPan", "pan", "card", "sourceCard", "mabda"]) ?? ""),
			sender: s.bankProvider === "HAMRAHBANK" ? "همراه‌بانک" : "بانک",
			raw: JSON.stringify(row).slice(0, 400),
			at: String(pick(row, ["date", "at", "createdAt", "time", "datetime", "tarikh"]) ?? ""),
			source: "BANK",
		})
		if (r.deposit && r.status !== "DUPLICATE") imported++
		if (r.status === "MATCHED") matched++
	}
	await saveCardAuto(adminId, { bankLastSyncAt: new Date().toISOString(), lastError: rows.length ? "" : "پاسخ سرویس بانک هیچ تراکنشی نداشت" })
	return { ok: true, fetched: rows.length, imported, matched, error: rows.length ? null : "پاسخ سرویس بانک هیچ تراکنشی نداشت" }
}

/** Worker job: poll every seller that enabled the bank bridge. */
export async function autoSyncBankDeposits(): Promise<number> {
	const rows = await prisma.setting.findMany({ where: { key: { startsWith: "store:card:" } }, select: { key: true, value: true } })
	let synced = 0
	for (const row of rows) {
		const parsed = cardAutoSchema.safeParse(row.value ?? {})
		if (!parsed.success) continue
		const s = parsed.data
		if (s.mode !== "BANK" || s.bankProvider === "NONE" || !s.bankApiUrl) continue
		const last = Date.parse(s.bankLastSyncAt)
		if (Number.isFinite(last) && Date.now() - last < s.bankPollMin * 60_000) continue
		const adminId = row.key.slice("store:card:".length)
		if (!adminId) continue
		const r = await syncBankDeposits(adminId).catch(() => null)
		if (r?.ok) synced++
	}
	return synced
}
