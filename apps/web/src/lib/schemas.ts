import { z } from "zod"

/* Shared zod schemas for API route bodies (route files may only export handlers). */

export const serverSchema = z.object({
	name: z.string().min(1).max(64),
	/** origin + webBasePath of the panel; normalized server-side */
	baseUrl: z.string().min(3).max(512),
	authMode: z.enum(["password", "token"]).optional(),
	username: z.string().max(128).optional(),
	password: z.string().min(1).max(256).optional(),
	/** 3X-UI v3: Settings -> Security -> API Token (admin scope) */
	apiToken: z.string().min(8).max(512).optional(),
	totpSecret: z.string().max(128).nullable().optional(),
	insecureTls: z.boolean().optional(),
	publicHost: z.string().max(253).nullable().optional(),
	subBaseUrl: z.string().max(512).nullable().optional(),
	weight: z.number().int().min(0).max(1000).optional(),
	isActive: z.boolean().optional(),
})

export const clientTargetSchema = z.object({ serverId: z.string().min(1), inboundId: z.number().int().nonnegative() })

export const createClientSchema = z
	.object({
		name: z.string().min(1).max(64),
		/** shown before the client name on every config of this client */
		tag: z.string().max(24).nullable().optional(),
		/** provision from an owner-defined service instead of hand-picked inbounds */
		serviceId: z.string().min(1).max(64).nullable().optional(),
		trafficGB: z.number().min(0).max(1_000_000),
		days: z.number().int().min(0).max(36500),
		/** count `days` from the customer's first connection instead of from now */
		startAfterUse: z.boolean().optional(),
		ipLimit: z.number().int().min(0).max(1000).optional(),
		note: z.string().max(500).nullable().optional(),
		telegramId: z.string().max(64).nullable().optional(),
		phone: z.string().max(32).nullable().optional(),
		targets: z.array(clientTargetSchema).max(50).optional(),
	})
	.refine((v) => Boolean(v.serviceId) || (v.targets?.length ?? 0) > 0, { message: "یک سرویس یا دست‌کم یک اینباند انتخاب کنید", path: ["targets"] })

export const updateClientSchema = z.object({
	name: z.string().min(1).max(64).optional(),
	tag: z.string().max(24).nullable().optional(),
	trafficGB: z.number().min(0).max(1_000_000).optional(),
	expiresAt: z.string().datetime().nullable().optional(),
	addDays: z.number().int().min(-36500).max(36500).optional(),
	ipLimit: z.number().int().min(0).max(1000).optional(),
	note: z.string().max(500).nullable().optional(),
	telegramId: z.string().max(64).nullable().optional(),
	phone: z.string().max(32).nullable().optional(),
	enabled: z.boolean().optional(),
})

/* ---------- services (owner-defined inbound bundles) ---------- */
export const serviceSchema = z.object({
	name: z.string().trim().min(1).max(60),
	description: z.string().max(300).nullable().optional(),
	targets: z.array(clientTargetSchema).min(1).max(100),
	/** empty = every admin may use it */
	adminIds: z.array(z.string().min(1).max(64)).max(500).optional(),
	isActive: z.boolean().optional(),
	sortOrder: z.number().int().min(-1000).max(1000).optional(),
})

export const serviceUpdateSchema = serviceSchema.partial()

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

/**
 * Plans are provisioned from a service (preferred) or raw inbounds (legacy).
 * Kept as a plain object — `/api/plans/[id]` relies on `planSchema.partial()` —
 * so the "pick one" rule is enforced in core (`createPlan`).
 */
export const planSchema = z.object({
	name: z.string().trim().min(1).max(60),
	description: z.string().max(500).nullable().optional(),
	badge: z.string().max(24).nullable().optional(),
	trafficGB: z.number().min(0).max(1_000_000),
	days: z.number().int().min(0).max(36500),
	ipLimit: z.number().int().min(0).max(1000).optional(),
	price: z.number().min(0).max(1e12),
	oldPrice: z.number().min(0).max(1e12).nullable().optional(),
	/** owner-defined service this plan sells */
	serviceId: z.string().min(1).max(64).nullable().optional(),
	targets: z.array(clientTargetSchema).max(50).optional(),
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
	/** crypto asset id when method = USDT (defaults to the first enabled asset) */
	assetId: z.string().max(40).nullable().optional(),
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
	/** which coin/network the buyer picked for a crypto payment */
	assetId: z.string().max(40).nullable().optional(),
	name: z.string().max(60).nullable().optional(),
	telegramId: z.string().max(24).nullable().optional(),
	phone: z.string().max(24).nullable().optional(),
	email: z.string().max(120).nullable().optional(),
	discountCode: z.string().max(24).nullable().optional(),
	renewToken: z.string().max(128).nullable().optional(),
})

export const shopDiscountSchema = z.object({ planId: z.string().min(1).max(64), code: z.string().min(1).max(24) })

/* ---------- automatic USDT pricing (FX) ---------- */
export const fxSourceSchema = z.enum(["NOBITEX", "WALLEX", "BITPIN", "TETHERLAND", "RAMZINEX", "CUSTOM"])

export const fxSettingsInput = z
	.object({
		mode: z.enum(["MANUAL", "AUTO"]),
		/** ordered fallback chain: the first source that answers wins */
		sources: z.array(fxSourceSchema).max(12),
		marginPct: z.number().min(-50).max(200),
		roundTo: z.number().int().min(0).max(1_000_000),
		ttlMin: z.number().int().min(1).max(1440),
		minRate: z.number().int().min(0).max(100_000_000),
		maxRate: z.number().int().min(0).max(100_000_000),
		customUrl: z.string().trim().max(500),
		customPath: z.string().trim().max(200),
		customUnit: z.enum(["IRT", "IRR"]),
	})
	.partial()

/* ---------- multi-coin crypto checkout ---------- */
export const cryptoNetworkSchema = z.enum(["TRC20", "BEP20", "ERC20", "TON", "SOL", "POLYGON", "ARBITRUM", "AVAX", "BTC", "LTC", "DOGE", "XMR", "OTHER"])

/** One receiving wallet: a coin on a specific network. */
export const cryptoAssetInput = z.object({
	id: z.string().max(40).optional(),
	/** coin symbol, e.g. USDT / TON / TRX */
	symbol: z.string().trim().min(2).max(12),
	network: cryptoNetworkSchema,
	address: z.string().trim().min(8).max(200),
	/** TON / EXMO style payment id */
	memo: z.string().trim().max(120).nullable().optional(),
	label: z.string().trim().max(60).nullable().optional(),
	enabled: z.boolean().optional(),
	/** USDT = priced by the seller's USDT rate, MARKET = live coin price, FIXED = manual */
	rateMode: z.enum(["USDT", "MARKET", "FIXED"]).optional(),
	/** IRT per 1 coin, used when rateMode = FIXED */
	fixedRate: z.number().min(0).max(1e12).optional(),
	/** extra margin on top of the coin price (%) */
	marginPct: z.number().min(-50).max(200).optional(),
	/** decimals shown to the buyer */
	decimals: z.number().int().min(0).max(8).optional(),
})

/** PUT /api/store/crypto */
export const cryptoAssetsInput = z.object({ assets: z.array(cryptoAssetInput).max(20) })

/* ---------- card-to-card auto verification ---------- */
export const cardAutoInput = z
	.object({
		mode: z.enum(["MANUAL", "SMS", "BANK"]),
		autoConfirm: z.boolean(),
		uniqueAmount: z.boolean(),
		windowMin: z.number().int().min(5).max(1440),
		toleranceIrt: z.number().int().min(0).max(100_000),
		requireLast4: z.boolean(),
		senders: z.array(z.string().trim().max(60)).max(20),
		bankProvider: z.enum(["NONE", "HAMRAHBANK", "CUSTOM"]),
		bankApiUrl: z.string().trim().max(500),
		bankUsername: z.string().trim().max(120),
		bankCard: z.string().trim().max(32),
		bankPollMin: z.number().int().min(1).max(240),
		/** plain token/password — stored encrypted; null clears it */
		bankSecret: z.string().max(500).nullable(),
	})
	.partial()

/* ---------- editable storefront content ---------- */
export const storePageIconSchema = z.enum(["shield", "bolt", "globe", "headset", "infinity", "lock", "device", "star", "clock", "wallet"])

const pageCardInput = z.object({
	icon: storePageIconSchema.default("star"),
	title: z.string().trim().max(60).default(""),
	text: z.string().trim().max(240).default(""),
})

const pageStepInput = z.object({
	title: z.string().trim().max(60).default(""),
	text: z.string().trim().max(240).default(""),
})

const pageFaqInput = z.object({
	q: z.string().trim().max(160).default(""),
	a: z.string().trim().max(800).default(""),
})

export const storePageInput = z
	.object({
		heroBadge: z.string().trim().max(60),
		heroTitle: z.string().trim().max(120),
		heroSubtitle: z.string().trim().max(300),
		heroCta: z.string().trim().max(40),
		showHero: z.boolean(),
		showFeatures: z.boolean(),
		showSteps: z.boolean(),
		showFaq: z.boolean(),
		showTrust: z.boolean(),
		showUsdtPrice: z.boolean(),
		statCustomers: z.string().trim().max(20),
		statUptime: z.string().trim().max(20),
		statLocations: z.string().trim().max(20),
		features: z.array(pageCardInput).max(8),
		steps: z.array(pageStepInput).max(8),
		faq: z.array(pageFaqInput).max(12),
		trustMoneyBack: z.boolean(),
		trustInstant: z.boolean(),
		trustSupport: z.boolean(),
		trustMultiDevice: z.boolean(),
		telegramChannel: z.string().trim().max(200),
		instagram: z.string().trim().max(200),
		whatsapp: z.string().trim().max(200),
		noticeText: z.string().trim().max(300),
		footerNote: z.string().trim().max(300),
	})
	.partial()

/** PUT /api/store/extras — every section is optional */
export const storeExtrasInput = z.object({
	fx: fxSettingsInput.optional(),
	card: cardAutoInput.optional(),
	page: storePageInput.optional(),
})

/* ---------- deposit webhook (SMS forwarder / bank bridge) ---------- */
export const depositHookSchema = z.object({
	/** raw SMS body — any of these keys is accepted */
	text: z.string().max(1200).nullable().optional(),
	body: z.string().max(1200).nullable().optional(),
	message: z.string().max(1200).nullable().optional(),
	msg: z.string().max(1200).nullable().optional(),
	sender: z.string().max(60).nullable().optional(),
	from: z.string().max(60).nullable().optional(),
	/** or a pre-parsed deposit */
	amount: z.union([z.number(), z.string().max(30)]).nullable().optional(),
	refId: z.string().max(60).nullable().optional(),
	last4: z.string().max(20).nullable().optional(),
	at: z.string().max(40).nullable().optional(),
})

/** POST /api/store/deposits — seller enters a deposit by hand */
export const manualDepositInput = z.object({
	amount: z.number().int().min(1000).max(1e12),
	refId: z.string().max(60).nullable().optional(),
	last4: z.string().max(20).nullable().optional(),
	note: z.string().max(200).nullable().optional(),
})
