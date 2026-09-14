/* Shared helpers for the unified log screen. */

export const tr = (locale: string, fa: string, en: string) => (locale === "fa" ? fa : en)

export const PAGE_SIZES = [25, 50, 100, 200]

export const LOG_SOURCES = ["audit", "notification", "webhook", "incident", "backup"] as const
export type LogSource = (typeof LOG_SOURCES)[number]

export const LOG_LEVELS = ["error", "warning", "success", "info"] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

export type Tone = "success" | "warning" | "danger" | "muted" | "violet" | "cyan"

export type LogRow = {
	id: string
	source: LogSource
	level: LogLevel
	at: string
	action: string
	actor: string | null
	adminId: string | null
	target: string | null
	text: string | null
	ip: string | null
	meta: unknown
}

export type SourceFacet = { id: LogSource; count: number }

export type LogSettings = {
	auditKeepDays: number
	notifyKeepDays: number
	webhookKeepDays: number
	incidentKeepDays: number
	autoPrune: boolean
}

export type LogStats = {
	totals: Record<LogSource, number>
	recent: Record<LogSource, number>
	errors24h: number
	total: number
	oldest: string | null
	settings: LogSettings
}

export type LogResponse = { items: LogRow[]; total: number; facets: SourceFacet[]; stats: LogStats | null }

export type PruneResult = { skipped: boolean; audit: number; notification: number; webhook: number; incident: number }

export const SOURCE_LABELS: Record<LogSource, [string, string]> = {
	audit: ["فعالیت ادمین", "Admin activity"],
	notification: ["اعلان‌ها", "Notifications"],
	webhook: ["وب‌هوک", "Webhooks"],
	incident: ["رویداد سرور", "Server incidents"],
	backup: ["پشتیبان‌گیری", "Backups"],
}

export const LEVEL_LABELS: Record<LogLevel, [string, string]> = {
	error: ["خطا", "Error"],
	warning: ["هشدار", "Warning"],
	success: ["موفق", "Success"],
	info: ["اطلاع", "Info"],
}

export const LEVEL_TONE: Record<LogLevel, Tone> = { error: "danger", warning: "warning", success: "success", info: "cyan" }

export const SOURCE_TONE: Record<LogSource, Tone> = { audit: "violet", notification: "cyan", webhook: "muted", incident: "danger", backup: "success" }

/** actions are stored as `<category>.<verb>` */
export const categoryOf = (action: string) => (action.includes(".") ? action.slice(0, action.indexOf(".")) : "other")
export const verbOf = (action: string) => (action.includes(".") ? action.slice(action.indexOf(".") + 1) : action)

export const CATEGORIES: Record<string, [string, string]> = {
	auth: ["ورود و امنیت", "Auth & security"],
	admin: ["ادمین‌ها", "Admins"],
	client: ["کاربران", "Clients"],
	server: ["سرورها", "Servers"],
	service: ["سرویس‌ها", "Services"],
	plan: ["پلن‌ها", "Plans"],
	order: ["سفارش‌ها", "Orders"],
	payment: ["پرداخت‌ها", "Payments"],
	wallet: ["کیف پول", "Wallet"],
	discount: ["کد تخفیف", "Discounts"],
	backup: ["پشتیبان‌گیری", "Backups"],
	settings: ["تنظیمات", "Settings"],
	webhook: ["وب‌هوک", "Webhooks"],
	apikey: ["کلید API", "API keys"],
	telegram: ["تلگرام", "Telegram"],
	notify: ["اعلان", "Notification"],
	incident: ["رویداد", "Incident"],
	system: ["سیستم", "System"],
	other: ["سایر", "Other"],
}

export const VERBS: Record<string, [string, string]> = {
	create: ["ایجاد", "created"],
	update: ["ویرایش", "updated"],
	delete: ["حذف", "deleted"],
	login: ["ورود", "signed in"],
	logout: ["خروج", "signed out"],
	login_failed: ["ورود ناموفق", "sign-in failed"],
	reset_traffic: ["صفر کردن ترافیک", "traffic reset"],
	sync: ["همگام‌سازی", "synced"],
	enable: ["فعال‌سازی", "enabled"],
	disable: ["غیرفعال‌سازی", "disabled"],
	totp_enabled: ["فعال‌سازی دومرحله‌ای", "2FA enabled"],
	totp_disabled: ["غیرفعال‌سازی دومرحله‌ای", "2FA disabled"],
	fulfill: ["تحویل", "fulfilled"],
	cancel: ["لغو", "cancelled"],
	approve: ["تأیید", "approved"],
	reject: ["رد", "rejected"],
	adjust: ["اصلاح موجودی", "balance adjusted"],
	renew: ["تمدید", "renewed"],
	restore: ["بازگردانی", "restored"],
	run: ["اجرا", "ran"],
	log_export: ["خروجی لاگ", "log exported"],
	log_prune: ["پاکسازی لاگ", "logs pruned"],
}

/** Human readable `<category>.<verb>`; falls back to the raw action. */
export function actionLabel(locale: string, action: string): string {
	const cat = CATEGORIES[categoryOf(action)]
	const verb = VERBS[verbOf(action)]
	if (cat && verb) return locale === "fa" ? `${cat[0]} — ${verb[0]}` : `${cat[1]} — ${verb[1]}`
	if (cat) return `${tr(locale, cat[0], cat[1])} — ${verbOf(action)}`
	return action
}
