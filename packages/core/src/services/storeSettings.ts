import { prisma, type Admin, type PaymentMethod, type StoreSettings } from "@srpanel/db"
import { z } from "zod"
import { decryptSecret, encryptSecret } from "../crypto/secretbox"
import { AppError } from "../util/errors"
import { audit } from "./audit"
import { panelUrl } from "./settings"

export const storeSettingsInput = z.object({
	enabled: z.boolean().optional(),
	slug: z.string().min(2).max(40).regex(/^[a-z0-9][a-z0-9_-]*$/i, "فقط حروف انگلیسی، عدد، - و _").optional(),
	title: z.string().max(80).nullable().optional(),
	description: z.string().max(1000).nullable().optional(),
	rules: z.string().max(4000).nullable().optional(),
	supportUrl: z.string().max(300).nullable().optional(),
	usdtEnabled: z.boolean().optional(),
	usdtAddress: z.string().max(64).nullable().optional(),
	usdtNetwork: z.string().max(16).optional(),
	usdtRate: z.number().int().min(0).optional(),
	usdtAutoVerify: z.boolean().optional(),
	cardEnabled: z.boolean().optional(),
	cardNumber: z.string().max(32).nullable().optional(),
	cardHolder: z.string().max(80).nullable().optional(),
	cardBank: z.string().max(60).nullable().optional(),
	zarinpalEnabled: z.boolean().optional(),
	/** plain merchant id — empty string keeps the stored one, null clears it */
	zarinpalMerchant: z.string().max(64).nullable().optional(),
	zarinpalSandbox: z.boolean().optional(),
	requireTelegram: z.boolean().optional(),
	requirePhone: z.boolean().optional(),
	paymentTtlMin: z.number().int().min(5).max(1440).optional(),
	// storefront accounts & wallet
	accountsEnabled: z.boolean().optional(),
	guestCheckout: z.boolean().optional(),
	walletEnabled: z.boolean().optional(),
	minTopup: z.number().int().min(0).max(2_000_000_000).optional(),
	topupBonusPct: z.number().int().min(0).max(50).optional(),
	requireEmail: z.boolean().optional(),
	announcement: z.string().max(300).nullable().optional(),
	termsUrl: z.string().max(300).nullable().optional(),
	telegramChannel: z.string().max(120).nullable().optional(),
})
export type StoreSettingsInput = z.infer<typeof storeSettingsInput>

export const defaultSlug = (username: string) => username.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40) || "shop"

export async function ensureStoreSettings(admin: Pick<Admin, "id" | "username">): Promise<StoreSettings> {
	const existing = await prisma.storeSettings.findUnique({ where: { adminId: admin.id } })
	if (existing) return existing
	let slug = defaultSlug(admin.username)
	if (await prisma.storeSettings.findUnique({ where: { slug } })) slug = `${slug}-${admin.id.slice(-4).toLowerCase()}`
	return prisma.storeSettings.create({ data: { adminId: admin.id, slug } })
}

export const storeSettingsByAdminId = (adminId: string) => prisma.storeSettings.findUnique({ where: { adminId } })

export function merchantOf(s: Pick<StoreSettings, "zarinpalMerchant">): string | null {
	if (!s.zarinpalMerchant) return null
	try {
		return decryptSecret(s.zarinpalMerchant)
	} catch {
		return null
	}
}

/** Verified custom domains serve the shop at `/shop`, otherwise it is `<panel>/shop/<slug>`. */
export function storeUrlFor(s: Pick<StoreSettings, "slug">, customDomain?: string | null): string {
	const domain = (customDomain ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "")
	if (domain) return "https://" + domain + "/shop"
	return panelUrl() + "/shop/" + s.slug
}

export function enabledMethods(s: StoreSettings): PaymentMethod[] {
	const out: PaymentMethod[] = []
	if (s.usdtEnabled && s.usdtAddress && s.usdtRate > 0) out.push("USDT")
	if (s.cardEnabled && s.cardNumber) out.push("CARD")
	if (s.zarinpalEnabled && s.zarinpalMerchant) out.push("ZARINPAL")
	return out
}

/** Payment methods a logged-in customer sees (wallet first when it can cover the order). */
export function enabledMethodsForCustomer(s: StoreSettings, opts: { loggedIn: boolean; balance?: bigint | null; amount?: bigint | null } = { loggedIn: false }): PaymentMethod[] {
	const base = enabledMethods(s)
	if (!opts.loggedIn || !s.walletEnabled) return base
	const balance = opts.balance ?? 0n
	const amount = opts.amount ?? 0n
	if (amount > 0n && balance < amount) return base
	return ["WALLET", ...base]
}

export function toStoreSettingsDto(s: StoreSettings, customDomain?: string | null) {
	const { zarinpalMerchant, ...rest } = s
	const m = merchantOf(s)
	return {
		...rest,
		// BigInt is not JSON-serializable
		minTopup: s.minTopup.toString(),
		hasZarinpal: !!m,
		zarinpalMerchantMasked: m ? `${m.slice(0, 6)}…${m.slice(-4)}` : "",
		url: storeUrlFor(s, customDomain),
		methods: enabledMethods(s),
	}
}

export async function updateStoreSettings(actor: Admin, input: StoreSettingsInput): Promise<StoreSettings> {
	const current = await ensureStoreSettings(actor)
	const data: Record<string, unknown> = {}
	for (const k of ["enabled", "title", "description", "rules", "supportUrl", "usdtEnabled", "usdtAddress", "usdtNetwork", "usdtRate", "usdtAutoVerify", "cardEnabled", "cardNumber", "cardHolder", "cardBank", "zarinpalEnabled", "zarinpalSandbox", "requireTelegram", "requirePhone", "paymentTtlMin", "accountsEnabled", "guestCheckout", "walletEnabled", "topupBonusPct", "requireEmail", "announcement", "termsUrl", "telegramChannel"] as const) {
		if (input[k] !== undefined) data[k] = typeof input[k] === "string" ? (input[k] as string).trim() || null : input[k]
	}
	if (input.minTopup !== undefined) data.minTopup = BigInt(input.minTopup)
	if (typeof data.usdtNetwork === "string") data.usdtNetwork = (data.usdtNetwork as string).toUpperCase()
	if (typeof data.cardNumber === "string") data.cardNumber = (data.cardNumber as string).replace(/[^0-9]/g, "")
	if (input.slug !== undefined) {
		const slug = input.slug.toLowerCase()
		const clash = await prisma.storeSettings.findUnique({ where: { slug } })
		if (clash && clash.adminId !== actor.id) throw new AppError("این نشانی فروشگاه قبلاّ گرفته شده است")
		data.slug = slug
	}
	if (input.zarinpalMerchant !== undefined) {
		if (input.zarinpalMerchant === null) data.zarinpalMerchant = null
		else if (input.zarinpalMerchant.trim()) data.zarinpalMerchant = encryptSecret(input.zarinpalMerchant.trim())
	}
	const next = { ...current, ...data } as StoreSettings
	if (next.usdtEnabled && (!next.usdtAddress || next.usdtRate <= 0)) throw new AppError("برای فعال کردن USDT آدرس ولت و نرخ تبدیل لازم است")
	if (next.cardEnabled && !next.cardNumber) throw new AppError("برای فعال کردن کارت‌به‌کارت شماره کارت لازم است")
	if (next.zarinpalEnabled && !next.zarinpalMerchant) throw new AppError("برای فعال کردن زرین‌پال مرچنت آی‌دی لازم است")
	if (!next.accountsEnabled && !next.guestCheckout) throw new AppError("حداقل یکی از «حساب مشتری» یا «خرید مهمان» باید فعال باشد")
	if (next.walletEnabled && !next.accountsEnabled) throw new AppError("کیف پول مشتری بدون فعال بودن حساب مشتری کار نمی‌کند")
	const saved = await prisma.storeSettings.update({ where: { id: current.id }, data })
	await audit(actor.id, "store.update", saved.id, { fields: Object.keys(data) })
	return saved
}
