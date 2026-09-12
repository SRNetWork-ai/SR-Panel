import type { AdminDto } from "@/lib/dto"

/* Local i18n helper: the shared dictionary has no keys for the new admin labels. */
export const tr = (locale: string, fa: string, en: string) => (locale === "fa" ? fa : en)

export type ServerLite = { id: string; name: string }

/** light projection of ServiceDto used by the admins screen */
export type ServiceLite = { id: string; name: string; isActive: boolean; adminIds: string[]; targetCount: number }

export type Form = {
	username: string
	password: string
	displayName: string
	isActive: boolean
	trafficQuotaGB: string
	clientLimit: string
	expiresAt: string
	telegramId: string
	/** services explicitly granted to this admin (public services are not listed here) */
	serviceIds: string[]
}

export const emptyForm: Form = { username: "", password: "", displayName: "", isActive: true, trafficQuotaGB: "", clientLimit: "", expiresAt: "", telegramId: "", serviceIds: [] }

const GB = 1024 ** 3

export function adminToForm(a: AdminDto, services: ServiceLite[]): Form {
	return {
		username: a.username,
		password: "",
		displayName: a.displayName ?? "",
		isActive: a.isActive,
		trafficQuotaGB: a.trafficQuota ? String(Math.round((a.trafficQuota / GB) * 100) / 100) : "",
		clientLimit: a.clientLimit ? String(a.clientLimit) : "",
		expiresAt: a.expiresAt ? a.expiresAt.slice(0, 10) : "",
		telegramId: a.telegramId ?? "",
		serviceIds: services.filter((s) => s.adminIds.includes(a.id)).map((s) => s.id),
	}
}

/** body for POST/PATCH /api/admins — legacy serverAccess is intentionally left untouched */
export function formToJson(f: Form) {
	return {
		username: f.username.trim().toLowerCase(),
		password: f.password || undefined,
		displayName: f.displayName.trim() || null,
		isActive: f.isActive,
		trafficQuotaGB: f.trafficQuotaGB === "" ? null : Number(f.trafficQuotaGB),
		clientLimit: f.clientLimit === "" ? null : Number(f.clientLimit),
		expiresAt: f.expiresAt ? new Date(`${f.expiresAt}T23:59:59`).toISOString() : null,
		telegramId: f.telegramId.trim() || null,
	}
}

export type AdminFilter = "all" | "active" | "inactive" | "expiring" | "noservice"
export type AdminSort = "name" | "clients" | "quota" | "expires" | "login"

/** a service with an empty adminIds list is usable by every admin */
export const isPublic = (s: ServiceLite) => s.adminIds.length === 0
export const servicesOf = (services: ServiceLite[], adminId: string) => services.filter((s) => s.adminIds.includes(adminId))
export const daysLeft = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null)
export const quotaPct = (a: AdminDto) => (a.trafficQuota ? Math.min(100, Math.round(((a.allocatedBytes ?? 0) / a.trafficQuota) * 100)) : 0)
