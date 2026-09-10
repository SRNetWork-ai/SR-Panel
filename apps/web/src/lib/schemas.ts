import { z } from "zod"

/* Shared zod schemas for API route bodies (route files may only export handlers). */

export const serverSchema = z.object({
	name: z.string().min(1).max(64),
	baseUrl: z.string().url().max(512),
	username: z.string().min(1).max(128),
	password: z.string().min(1).max(256).optional(),
	publicHost: z.string().max(253).nullable().optional(),
	subBaseUrl: z.string().max(512).nullable().optional(),
	weight: z.number().int().min(0).max(1000).optional(),
	isActive: z.boolean().optional(),
})

export const clientTargetSchema = z.object({ serverId: z.string().min(1), inboundId: z.number().int().nonnegative() })

export const createClientSchema = z.object({
	name: z.string().min(1).max(64),
	trafficGB: z.number().min(0).max(1_000_000),
	days: z.number().int().min(0).max(36500),
	ipLimit: z.number().int().min(0).max(1000).optional(),
	note: z.string().max(500).nullable().optional(),
	telegramId: z.string().max(64).nullable().optional(),
	phone: z.string().max(32).nullable().optional(),
	targets: z.array(clientTargetSchema).min(1).max(50),
})

export const updateClientSchema = z.object({
	name: z.string().min(1).max(64).optional(),
	trafficGB: z.number().min(0).max(1_000_000).optional(),
	expiresAt: z.string().datetime().nullable().optional(),
	addDays: z.number().int().min(-36500).max(36500).optional(),
	ipLimit: z.number().int().min(0).max(1000).optional(),
	note: z.string().max(500).nullable().optional(),
	telegramId: z.string().max(64).nullable().optional(),
	phone: z.string().max(32).nullable().optional(),
	enabled: z.boolean().optional(),
})

export const adminSchema = z.object({
	username: z.string().regex(/^[a-z0-9_.-]{3,32}$/, "فقط حروف کوچک انگلیسی، عدد، نقطه، خط تیره و زیرخط (۳ـ۳۲ کاراکتر)"),
	password: z.string().min(8).max(256).optional(),
	displayName: z.string().max(64).nullable().optional(),
	isActive: z.boolean().optional(),
	trafficQuotaGB: z.number().min(0).max(10_000_000).nullable().optional(),
	clientLimit: z.number().int().min(0).max(1_000_000).nullable().optional(),
	expiresAt: z.string().datetime().nullable().optional(),
	telegramId: z.string().max(64).nullable().optional(),
	serverAccess: z.array(z.object({ serverId: z.string().min(1), inboundIds: z.array(z.number().int()) })).optional(),
})

export const brandSchema = z.object({
	name: z.string().min(1).max(64),
	tagline: z.string().max(140).nullable().optional(),
	logoUrl: z.string().url().max(512).nullable().optional().or(z.literal("").transform(() => null)),
	primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
	accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
	supportUrl: z.string().url().max(512).nullable().optional().or(z.literal("").transform(() => null)),
	telegramUrl: z.string().url().max(512).nullable().optional().or(z.literal("").transform(() => null)),
})

/* ---------- stage 2A ---------- */
export const telegramSettingsInput = z.object({
	enabled: z.boolean(),
	botToken: z.string().trim().max(120),
	chatId: z.string().trim().max(40),
	botEnabled: z.boolean(),
	notifyIncidents: z.boolean(),
	notifyBackups: z.boolean(),
	notifyExpiry: z.boolean(),
	notifyTraffic: z.boolean(),
	notifyLogins: z.boolean(),
	notifyClientsDirect: z.boolean(),
})

export const backupSettingsInput = z.object({
	enabled: z.boolean(),
	hour: z.number().int().min(0).max(23),
	keepLast: z.number().int().min(1).max(90),
	sendToTelegram: z.boolean(),
})

export const monitoringSettingsInput = z.object({
	failThreshold: z.number().int().min(1).max(10),
	cpuThreshold: z.number().int().min(50).max(100),
	expiryReminderDays: z.array(z.number().int().min(1).max(60)).max(5),
	trafficReminderPct: z.array(z.number().int().min(50).max(99)).max(5),
})

export const apiKeySchema = z.object({
	name: z.string().trim().min(1).max(60),
	scopes: z.array(z.enum(["read", "write"])).min(1),
	expiresAt: z.string().datetime().nullable().optional(),
})

export const webhookSchema = z.object({
	url: z.string().url().max(512).refine((u) => /^https?:\/\//.test(u), "http(s) only"),
	events: z.array(z.string().max(40)).max(30).default([]),
	isActive: z.boolean().default(true),
})

/* public API (v1) — same contract as the panel UI */
export const v1CreateClientSchema = createClientSchema

/* ---------- stage 2B: store / wallet ---------- */
export const paymentMethodSchema = z.enum(["USDT", "CARD", "ZARINPAL"])

export const planSchema = z.object({
	name: z.string().trim().min(1).max(60),
	description: z.string().max(500).nullable().optional(),
	badge: z.string().max(24).nullable().optional(),
	trafficGB: z.number().min(0).max(1_000_000),
	days: z.number().int().min(0).max(36500),
	ipLimit: z.number().int().min(0).max(1000).optional(),
	price: z.number().min(0).max(1e12),
	oldPrice: z.number().min(0).max(1e12).nullable().optional(),
	targets: z.array(clientTargetSchema).min(1).max(50),
	isActive: z.boolean().optional(),
	sortOrder: z.number().int().min(-1000).max(1000).optional(),
})

export const discountSchema = z.object({
	code: z.string().trim().min(3).max(24),
	percent: z.number().int().min(0).max(100).optional(),
	amount: z.number().min(0).max(1e12).optional(),
	maxUses: z.number().int().min(1).max(1_000_000).nullable().optional(),
	expiresAt: z.string().datetime().nullable().optional(),
	isActive: z.boolean().optional(),
})

export const pricingSettingsInput = z.object({
	billingEnabled: z.boolean(),
	pricePerGB: z.number().int().min(0).max(1e9),
	pricePerDay: z.number().int().min(0).max(1e9),
	chargeOnRenew: z.boolean(),
	creditLimit: z.number().int().min(0).max(1e12),
})

export const walletAdjustSchema = z.object({
	adminId: z.string().min(1).max(64),
	amount: z.number().int().min(-1e12).max(1e12).refine((n) => n !== 0, "مقدار نمی‌تواند صفر باشد"),
	note: z.string().max(200).nullable().optional(),
})

export const resellerPricingSchema = z.object({
	pricePerGB: z.number().int().min(0).max(1e9).nullable().optional(),
	pricePerDay: z.number().int().min(0).max(1e9).nullable().optional(),
})

export const topupSchema = z.object({
	amount: z.number().int().min(1000).max(1e12),
	method: paymentMethodSchema,
})

export const proofSchema = z.object({
	txid: z.string().max(80).nullable().optional(),
	receiptRef: z.string().max(80).nullable().optional(),
	cardPan: z.string().max(24).nullable().optional(),
})

export const reviewSchema = z.object({ note: z.string().max(300).nullable().optional() })

export const shopOrderSchema = z.object({
	planId: z.string().min(1).max(64),
	method: paymentMethodSchema,
	name: z.string().max(60).nullable().optional(),
	telegramId: z.string().max(24).nullable().optional(),
	phone: z.string().max(24).nullable().optional(),
	email: z.string().max(120).nullable().optional(),
	discountCode: z.string().max(24).nullable().optional(),
	renewToken: z.string().max(128).nullable().optional(),
})

export const shopDiscountSchema = z.object({ planId: z.string().min(1).max(64), code: z.string().min(1).max(24) })
