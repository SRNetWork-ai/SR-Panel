"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { HardDrive, Layers, ShieldCheck, ShieldPlus, Users } from "lucide-react"
import { MiniStat } from "@/components/bits"
import { Button, Card, Empty, Input, PageHeader, Select, cx, useConfirm, useToast } from "@/components/ui"
import { ApiError, api } from "@/lib/client"
import type { AdminDto } from "@/lib/dto"
import { formatBytes, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { AdminCard } from "./AdminCard"
import { AdminFormModal } from "./AdminFormModal"
import { daysLeft, isPublic, quotaPct, servicesOf, tr, type AdminFilter, type AdminSort, type ServerLite, type ServiceLite } from "./types"

export function AdminsClient({ initial, servers, services: initialServices, selfId }: { initial: AdminDto[]; servers: ServerLite[]; services: ServiceLite[]; selfId: string }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const confirm = useConfirm()
	const router = useRouter()
	const [admins, setAdmins] = useState(initial)
	const [services, setServices] = useState(initialServices)
	const [modal, setModal] = useState<"new" | AdminDto | null>(null)
	const [q, setQ] = useState("")
	const [filter, setFilter] = useState<AdminFilter>("all")
	const [sort, setSort] = useState<AdminSort>("name")

	const sharedCount = services.filter(isPublic).length

	const totals = useMemo(() => {
		const resellers = admins.filter((a) => a.role !== "OWNER")
		return {
			admins: resellers.length,
			active: resellers.filter((a) => a.isActive).length,
			clients: admins.reduce((s, a) => s + (a.clientCount ?? 0), 0),
			allocated: admins.reduce((s, a) => s + (a.allocatedBytes ?? 0), 0),
		}
	}, [admins])

	const counts = useMemo(() => {
		const res = admins.filter((a) => a.role !== "OWNER")
		const left = (a: AdminDto) => daysLeft(a.expiresAt)
		return {
			all: admins.length,
			active: admins.filter((a) => a.isActive).length,
			inactive: admins.filter((a) => !a.isActive).length,
			expiring: res.filter((a) => { const d = left(a); return d !== null && d <= 7 }).length,
			noservice: sharedCount > 0 ? 0 : res.filter((a) => servicesOf(services, a.id).length === 0).length,
		}
	}, [admins, services, sharedCount])

	const rows = useMemo(() => {
		const needle = q.trim().toLowerCase()
		const keep = (a: AdminDto) => {
			if (needle && !`${a.username} ${a.displayName ?? ""} ${a.telegramId ?? ""}`.toLowerCase().includes(needle)) return false
			const d = daysLeft(a.expiresAt)
			if (filter === "active") return a.isActive
			if (filter === "inactive") return !a.isActive
			if (filter === "expiring") return a.role !== "OWNER" && d !== null && d <= 7
			if (filter === "noservice") return a.role !== "OWNER" && sharedCount === 0 && servicesOf(services, a.id).length === 0
			return true
		}
		const name = (a: AdminDto) => a.displayName || a.username
		const time = (iso: string | null, fallback: number) => (iso ? new Date(iso).getTime() : fallback)
		return admins.filter(keep).sort((x, y) => {
			if ((x.role === "OWNER") !== (y.role === "OWNER")) return x.role === "OWNER" ? -1 : 1
			if (sort === "clients") return (y.clientCount ?? 0) - (x.clientCount ?? 0)
			if (sort === "quota") return quotaPct(y) - quotaPct(x)
			if (sort === "expires") return time(x.expiresAt, Number.MAX_SAFE_INTEGER) - time(y.expiresAt, Number.MAX_SAFE_INTEGER)
			if (sort === "login") return time(y.lastLoginAt, 0) - time(x.lastLoginAt, 0)
			return name(x).localeCompare(name(y))
		})
	}, [admins, services, q, filter, sort, sharedCount])

	const chips: { id: AdminFilter; label: string; count: number }[] = [
		{ id: "all", label: t("all"), count: counts.all },
		{ id: "active", label: t("active"), count: counts.active },
		{ id: "inactive", label: t("inactive"), count: counts.inactive },
		{ id: "expiring", label: L("در معرض انقضا", "Expiring"), count: counts.expiring },
		{ id: "noservice", label: L("بی‌سرویس", "No service"), count: counts.noservice },
	]

	const onSaved = (a: AdminDto, isNew: boolean, changed: ServiceLite[]) => {
		setAdmins((l) => (isNew ? [...l, a] : l.map((x) => (x.id === a.id ? { ...x, ...a } : x))))
		if (changed.length) setServices((l) => l.map((s) => changed.find((c) => c.id === s.id) ?? s))
		setModal(null)
		router.refresh()
	}

	const toggleActive = async (a: AdminDto) => {
		try {
			const up = await api<AdminDto>(`/api/admins/${a.id}`, { method: "PATCH", json: { isActive: !a.isActive } })
			setAdmins((l) => l.map((x) => (x.id === up.id ? { ...x, ...up } : x)))
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		}
	}

	const remove = async (a: AdminDto) => {
		if (!confirm(`${t("delete")} «${a.username}» — ${t("confirm_delete")}`)) return
		try {
			await api(`/api/admins/${a.id}`, { method: "DELETE" })
			setAdmins((l) => l.filter((x) => x.id !== a.id))
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		}
	}

	return (
		<div className="space-y-4">
			<PageHeader
				title={t("ad_title")}
				subtitle={t("ad_sub")}
				actions={
					<Button variant="primary" type="button" onClick={() => setModal("new")}>
						<ShieldPlus className="h-4 w-4" />
						{t("ad_add")}
					</Button>
				}
			/>

			<div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
				<MiniStat icon={<ShieldCheck className="h-4 w-4" />} label={t("ad_title")} value={formatNumber(totals.admins, locale)} />
				<MiniStat icon={<ShieldCheck className="h-4 w-4" />} label={t("active")} value={formatNumber(totals.active, locale)} tone="success" />
				<MiniStat icon={<Users className="h-4 w-4" />} label={t("nav_clients")} value={formatNumber(totals.clients, locale)} tone="cyan" />
				<MiniStat icon={<HardDrive className="h-4 w-4" />} label={L("ترافیک تخصیص‌یافته", "Allocated traffic")} value={formatBytes(totals.allocated)} tone="warning" />
			</div>

			<Card bodyClassName="space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<div className="min-w-48 flex-1">
						<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("جستجوی نام کاربری، نام یا تلگرام…", "Search username, name or Telegram…")} />
					</div>
					<Select value={sort} onChange={(e) => setSort(e.target.value as AdminSort)} className="w-auto">
						<option value="name">{L("مرتب‌سازی: نام", "Sort: name")}</option>
						<option value="clients">{L("مرتب‌سازی: تعداد کاربر", "Sort: clients")}</option>
						<option value="quota">{L("مرتب‌سازی: مصرف سهمیه", "Sort: quota usage")}</option>
						<option value="expires">{L("مرتب‌سازی: تاریخ انقضا", "Sort: expiry")}</option>
						<option value="login">{L("مرتب‌سازی: آخرین ورود", "Sort: last login")}</option>
					</Select>
				</div>
				<div className="flex flex-wrap gap-1.5">
					{chips.map((c) => (
						<button key={c.id} type="button" onClick={() => setFilter(c.id)} className={cx("chip", filter === c.id && "chip-on")}>
							{c.label}
							<span className="num text-[10px] text-muted">{formatNumber(c.count, locale)}</span>
						</button>
					))}
					{sharedCount > 0 && (
						<span className="chip">
							<Layers className="h-3.5 w-3.5" />
							{L(`${formatNumber(sharedCount, locale)} سرویس عمومی`, `${sharedCount} shared services`)}
						</span>
					)}
				</div>
			</Card>

			{rows.length === 0 ? (
				<Card>
					<Empty text={L("ادمینی با این فیلتر پیدا نشد", "No admin matches this filter")} action={<Button type="button" variant="primary" onClick={() => setModal("new")}>{t("ad_add")}</Button>} />
				</Card>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{rows.map((a) => (
						<AdminCard key={a.id} admin={a} services={services} servers={servers} selfId={selfId} onEdit={() => setModal(a)} onToggle={() => toggleActive(a)} onDelete={() => remove(a)} />
					))}
				</div>
			)}

			{modal !== null && <AdminFormModal editing={modal} services={services} servers={servers} onClose={() => setModal(null)} onSaved={onSaved} />}
		</div>
	)
}
