/* Shared helpers for the audit log screen. */

export const tr = (locale: string, fa: string, en: string) => (locale === "fa" ? fa : en)

export type AuditRow = { id: string; at: string; actor: string | null; actorUsername: string | null; action: string; target: string | null; meta: unknown; ip: string | null }
export type Facet = { id: string; count: number }
export type AuditResponse = { items: AuditRow[]; total: number; facets: Facet[] }

export const PAGE_SIZES = [25, 50, 100, 200]

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
}

export type Tone = "success" | "warning" | "danger" | "muted" | "violet" | "cyan"

export function toneOf(action: string): Tone {
	const verb = verbOf(action)
	if (verb === "delete" || verb === "login_failed" || verb === "totp_disabled" || verb === "reject" || verb === "cancel") return "danger"
	if (verb === "create" || verb === "approve" || verb === "fulfill" || verb === "totp_enabled" || verb === "enable") return "success"
	if (verb === "reset_traffic" || verb === "disable") return "warning"
	if (categoryOf(action) === "auth") return "cyan"
	return "violet"
}

/** CSV of the rows currently loaded in the table */
export function csvOf(rows: AuditRow[]) {
	const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
	const head = ["at", "actor", "action", "target", "ip", "meta"].join(",")
	const body = rows.map((r) => [r.at, r.actorUsername ?? r.actor ?? "", r.action, r.target ?? "", r.ip ?? "", r.meta ? JSON.stringify(r.meta) : ""].map(esc).join(","))
	return [head, ...body].join("\n")
}
