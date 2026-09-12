import { z } from "zod"
import { getSetting, setSetting } from "./settings"

/**
 * Editable storefront content (hero, feature cards, steps, FAQ, trust badges).
 *
 * Lives in the generic `Setting` table so the public shop can be rich and
 * seller-specific without a schema change. Every field ships with a sensible
 * Persian default, so a brand new store already looks finished.
 */

const iconEnum = z.enum(["shield", "bolt", "globe", "headset", "infinity", "lock", "device", "star", "clock", "wallet"])
export type StorePageIcon = z.infer<typeof iconEnum>

const cardSchema = z.object({
	icon: iconEnum.default("star"),
	title: z.string().trim().max(60).default(""),
	text: z.string().trim().max(240).default(""),
})

const faqSchema = z.object({
	q: z.string().trim().max(160).default(""),
	a: z.string().trim().max(800).default(""),
})

const stepSchema = z.object({
	title: z.string().trim().max(60).default(""),
	text: z.string().trim().max(240).default(""),
})

export const DEFAULT_FEATURES = [
	{ icon: "bolt" as const, title: "سرعت بالا", text: "سرورهای پرسرعت با پهنای باند اختصاصی؛ مناسب بازی، تماس تصویری و پخش ۴K." },
	{ icon: "shield" as const, title: "امنیت و حفاطت", text: "پروتکل‌های مدرن با رمزنگاری کامل و بدون نگه‌داری گزارش فعالیت." },
	{ icon: "device" as const, title: "همه دستگاه‌ها", text: "اندروید، آیفون، ویندوز، مک و لینوکس — با یک لینک اشتراک." },
	{ icon: "headset" as const, title: "پشتیبانی واقعی", text: "پاسخگویی سریع در تلگرام برای خرید، نصب و تمدید." },
]

export const DEFAULT_STEPS = [
	{ title: "پلن را انتخاب کنید", text: "حجم و مدت مورد نیاز خود را انتخاب کنید." },
	{ title: "پرداخت کنید", text: "کارت به کارت، درگاه بانکی یا تتر (USDT)." },
	{ title: "لینک را دریافت کنید", text: "لینک اشتراک بلافاصله پس از تأیید پرداخت ساخته می‌شود." },
	{ title: "در اپ وارد کنید", text: "لینک را در برنامه مورد علاقه خود افزوده و متصل شوید." },
]

export const DEFAULT_FAQ = [
	{ q: "بعد از پرداخت چقدر طول می‌کشد اشتراک من فعال شود؟", a: "در پرداخت آنلاین و تتر، اشتراک بلافاصله و خودکار ساخته می‌شود. در کارت به کارت، اگر تأیید خودکار فعال باشد معمولاً کمتر از یک دقیقه طول می‌کشد." },
	{ q: "اشتراک روی چند دستگاه کار می‌کند؟", a: "بسته به پلن انتخابی؛ محدودیت اتصال همزمان روی هر پلن نوشته شده است." },
	{ q: "اگر لینک وصل نشد چه کار کنم؟", a: "ابتدا لینک اشتراک را در برنامه به‌روزرسانی (Update) کنید؛ اگر درست نشد کنفیگ دیگری را امتحان کنید و در نهایت به پشتیبانی پیام دهید." },
	{ q: "تمدید اشتراک چطور انجام می‌شود؟", a: "از همان صفحه اشتراک خود دکمهٔ تمدید را بزنید؛ حجم جدید روی همان لینک قبلی اعمال می‌شود." },
]

export const storePageSchema = z.object({
	heroBadge: z.string().trim().max(60).default("ارسال فوری • ۲۴ ساعته"),
	heroTitle: z.string().trim().max(120).default("اینترنت بدون محدودیت، ساده و مطمئن"),
	heroSubtitle: z.string().trim().max(300).default("پلن مناسب خود را انتخاب کنید، پرداخت کنید و در کمتر از یک دقیقه لینک اشتراک خود را تحویل بگیرید."),
	heroCta: z.string().trim().max(40).default("مشاهده پلن‌ها"),
	showHero: z.boolean().default(true),
	showFeatures: z.boolean().default(true),
	showSteps: z.boolean().default(true),
	showFaq: z.boolean().default(true),
	showTrust: z.boolean().default(true),
	showUsdtPrice: z.boolean().default(true),
	/** free-form marketing numbers; hidden when empty */
	statCustomers: z.string().trim().max(20).default(""),
	statUptime: z.string().trim().max(20).default("99.9%"),
	statLocations: z.string().trim().max(20).default(""),
	features: z.array(cardSchema).max(8).default(DEFAULT_FEATURES),
	steps: z.array(stepSchema).max(8).default(DEFAULT_STEPS),
	faq: z.array(faqSchema).max(12).default(DEFAULT_FAQ),
	trustMoneyBack: z.boolean().default(true),
	trustInstant: z.boolean().default(true),
	trustSupport: z.boolean().default(true),
	trustMultiDevice: z.boolean().default(true),
	telegramChannel: z.string().trim().max(200).default(""),
	instagram: z.string().trim().max(200).default(""),
	whatsapp: z.string().trim().max(200).default(""),
	noticeText: z.string().trim().max(300).default(""),
	footerNote: z.string().trim().max(300).default(""),
})
export type StorePage = z.infer<typeof storePageSchema>

const pageKey = (adminId: string) => `store:page:${adminId}`

export const storePage = (adminId: string) => getSetting(pageKey(adminId), storePageSchema, 10_000)

export async function saveStorePage(adminId: string, patch: Partial<StorePage>): Promise<StorePage> {
	const current = await storePage(adminId)
	return setSetting(pageKey(adminId), storePageSchema, { ...current, ...patch })
}

/** Drops empty cards so the public payload never renders blank boxes. */
export function cleanStorePage(p: StorePage): StorePage {
	return {
		...p,
		features: p.features.filter((f) => f.title || f.text),
		steps: p.steps.filter((s) => s.title || s.text),
		faq: p.faq.filter((f) => f.q && f.a),
	}
}
