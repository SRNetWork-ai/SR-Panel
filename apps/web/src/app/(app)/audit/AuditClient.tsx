"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Download, RefreshCw, Save, Search, Trash2 } from "lucide-react"
import { Button, Card, Field, Input, PageHeader, Select, Spinner, Stat, cx, useConfirm, useToast } from "@/components/ui"
import { api } from "@/lib/client"
import { formatDate, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { AuditTable } from "./AuditTable"
import {
	LEVEL_LABELS,
	LOG_LEVELS,
	LOG_SOURCES,
	PAGE_SIZES,
	SOURCE_LABELS,
	tr,
	type LogLevel,
	type LogResponse,
	type LogRow,
	type LogSettings,
	type LogSource,
	type LogStats,
	type PruneResult,
	type SourceFacet,
} from "./types"

export function AuditClient() {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const L = (fa: string, en: string) => tr(locale, fa, en)

	const [rows, setRows] = useState<LogRow[]>([])
	const [facets, setFacets] = useState<SourceFacet[]>([])
	const [total, setTotal] = useState(0)
	const [stats, setStats] = useState<LogStats | null>(null)
	const [form, setForm] = useState<LogSettings | null>(null)
	const [sources, setSources] = useState<LogSource[]>([])
	const [levels, setLevels] = useState<LogLevel[]>([])
	const [q, setQ] = useState("")
	const [from, setFrom] = useState("")
	const [to, setTo] = useState("")
	const [take, setTake] = useState(50)
	const [page, setPage] = useState(0)
	const [tick, setTick] = useState(0)
	const [statsTick, setStatsTick] = useState(0)
	const [live, setLive] = useState(false)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)

	const params = useMemo(() => {
		const sp = new URLSearchParams()
		if (sources.length) sp.set("sources", sources.join(","))
		if (levels.length) sp.set("levels", levels.join(","))
		if (q.trim()) sp.set("q", q.trim())
		if (from) sp.set("from", from)
		if (to) sp.set("to", to)
		return sp.toString()
	}, [sources, levels, q, from, to])

	useEffect(() => {
		let alive = true
		const h = setTimeout(async () => {
			setLoading(true)
			try {
				const sp = new URLSearchParams(params)
				sp.set("take", String(take))
				sp.set("skip", String(page * take))
				const r = await api<LogResponse>(`/api/logs?${sp.toString()}`)
				if (!alive) return
				setRows(r.items)
				setTotal(r.total)
				setFacets(r.facets)
			} catch {
				/* keep the current page on a transient error */
			} finally {
				if (alive) setLoading(false)
			}
		}, q ? 300 : 0)
		return () => {
			alive = false
			clearTimeout(h)
		}
	}, [params, take, page, tick, q])

	useEffect(() => {
		let alive = true
		const load = async () => {
			try {
				const r = await api<LogResponse>("/api/logs?take=1&stats=1")
				const s = r.stats
				if (!alive || !s) return
				setStats(s)
				setForm((prev) => prev ?? s.settings)
			} catch {
				/* stats are optional */
			}
		}
		void load()
		return () => {
			alive = false
		}
	}, [statsTick])

	useEffect(() => {
		if (!live) return
		const id = setInterval(() => setTick((x) => x + 1), 5000)
		return () => clearInterval(id)
	}, [live])

	const pages = Math.max(1, Math.ceil(total / take))
	const dirty = Boolean(q || from || to || sources.length || levels.length)
	const countOf = (id: LogSource) => facets.find((f) => f.id === id)?.count ?? 0
	const recent24 = stats ? LOG_SOURCES.reduce((n, s) => n + (stats.recent[s] ?? 0), 0) : 0

	const toggleSource = (id: LogSource) => {
		setSources((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
		setPage(0)
	}
	const toggleLevel = (id: LogLevel) => {
		setLevels((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
		setPage(0)
	}
	const clearAll = () => {
		setQ("")
		setFrom("")
		setTo("")
		setSources([])
		setLevels([])
		setPage(0)
	}

	const exportCsv = () => {
		const sp = new URLSearchParams(params)
		sp.set("take", "2000")
		window.open(`/api/logs/export?${sp.toString()}`, "_blank")
	}

	const saveSettings = async () => {
		if (!form) return
		setSaving(true)
		try {
			await api<LogSettings>("/api/logs/settings", { method: "PUT", json: form })
			toast.ok(L("تنظیمات نگه‌داری ذخیره شد", "Retention saved"))
			setStatsTick((x) => x + 1)
		} catch (err) {
			toast.err(err instanceof Error ? err.message : L("خطا در ذخیره", "Save failed"))
		} finally {
			setSaving(false)
		}
	}

	const pruneNow = async () => {
		if (!confirm(L("لاگ‌های قدیمی‌تر از بازه‌های تعیین‌شده حذف شوند؟", "Delete logs older than the configured windows?"))) return
		setSaving(true)
		try {
			const r = await api<PruneResult>("/api/logs/prune", { method: "POST" })
			const n = r.audit + r.notification + r.webhook + r.incident
			toast.ok(L(`${formatNumber(n, locale)} ردیف حذف شد`, `${n} rows deleted`))
			setTick((x) => x + 1)
			setStatsTick((x) => x + 1)
		} catch (err) {
			toast.err(err instanceof Error ? err.message : L("خطا در پاکسازی", "Prune failed"))
		} finally {
			setSaving(false)
		}
	}

	const keepField = (label: string, value: number, set: (n: number) => void) => (
		<Field label={label} hint={L("۰ = نگه‌داری همیشگی", "0 = keep forever")}>
			<Input
				type="number"
				min={0}
				max={3650}
				value={String(value)}
				onChange={(e) => set(Math.max(0, Math.min(3650, Math.round(Number(e.target.value) || 0))))}
			/>
		</Field>
	)

	return (
		<div className="space-y-4">
			<PageHeader
				title={L("لاگ یکپارچه", "Unified log")}
				subtitle={L("فعالیت ادمین، اعلان‌ها، وب‌هوک، رویداد سرورها و پشتیبان‌گیری در یک جدول", "Admin activity, notifications, webhooks, incidents and backups in one stream")}
				actions={
					<>
						<button type="button" onClick={() => setLive((x) => !x)} className={cx("chip", live && "chip-on")}>
							{L("زنده", "Live")}
						</button>
						<Button type="button" variant="ghost" onClick={() => setTick((x) => x + 1)} loading={loading}>
							<RefreshCw className="h-4 w-4" />
							{t("refresh")}
						</Button>
						<Button type="button" onClick={exportCsv}>
							<Download className="h-4 w-4" />
							CSV
						</Button>
					</>
				}
			/>

			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<Stat label={L("کل ردیف‌ها", "Total rows")} value={formatNumber(stats ? stats.total : 0, locale)} accent="violet" />
				<Stat label={L("۲۴ ساعت گذشته", "Last 24h")} value={formatNumber(recent24, locale)} accent="cyan" />
				<Stat label={L("خطای ۲۴ ساعت", "Errors 24h")} value={formatNumber(stats ? stats.errors24h : 0, locale)} accent={stats && stats.errors24h > 0 ? "danger" : "success"} />
				<Stat
					label={L("قدیمی‌ترین رویداد", "Oldest entry")}
					value={stats && stats.oldest ? formatDate(stats.oldest, locale) : "—"}
					sub={L("فعالیت ادمین", "Admin activity")}
					accent="magenta"
				/>
			</div>

			<Card bodyClassName="space-y-3">
				<div className="flex flex-wrap items-end gap-2">
					<div className="relative min-w-52 flex-1">
						<Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted" />
						<Input
							className="ps-10"
							placeholder={L("جستجو در رویداد، هدف، کاربر، خطا یا IP…", "Search action, target, actor, error or IP…")}
							value={q}
							onChange={(e) => {
								setQ(e.target.value)
								setPage(0)
							}}
						/>
					</div>
					<Field label={L("از تاریخ", "From")} className="w-36">
						<Input
							type="date"
							className="text-start"
							value={from}
							onChange={(e) => {
								setFrom(e.target.value)
								setPage(0)
							}}
						/>
					</Field>
					<Field label={L("تا تاریخ", "To")} className="w-36">
						<Input
							type="date"
							className="text-start"
							value={to}
							onChange={(e) => {
								setTo(e.target.value)
								setPage(0)
							}}
						/>
					</Field>
					<Select
						className="w-auto"
						value={take}
						onChange={(e) => {
							setTake(Number(e.target.value))
							setPage(0)
						}}
					>
						{PAGE_SIZES.map((n) => (
							<option key={n} value={n}>
								{L(`${formatNumber(n, locale)} ردیف`, `${n} rows`)}
							</option>
						))}
					</Select>
					{dirty && (
						<Button type="button" variant="ghost" onClick={clearAll}>
							{L("پاک کردن فیلترها", "Clear filters")}
						</Button>
					)}
				</div>

				<div className="flex flex-wrap gap-1.5">
					<button type="button" onClick={() => { setSources([]); setPage(0) }} className={cx("chip", sources.length === 0 && "chip-on")}>
						{t("all")}
					</button>
					{LOG_SOURCES.map((s) => (
						<button key={s} type="button" onClick={() => toggleSource(s)} className={cx("chip", sources.includes(s) && "chip-on")}>
							{tr(locale, SOURCE_LABELS[s][0], SOURCE_LABELS[s][1])}
							<span className="num text-[10px] text-muted">{formatNumber(countOf(s), locale)}</span>
						</button>
					))}
				</div>

				<div className="flex flex-wrap gap-1.5">
					<button type="button" onClick={() => { setLevels([]); setPage(0) }} className={cx("chip", levels.length === 0 && "chip-on")}>
						{L("همه سطح‌ها", "All levels")}
					</button>
					{LOG_LEVELS.map((l) => (
						<button key={l} type="button" onClick={() => toggleLevel(l)} className={cx("chip", levels.includes(l) && "chip-on")}>
							{tr(locale, LEVEL_LABELS[l][0], LEVEL_LABELS[l][1])}
						</button>
					))}
				</div>
			</Card>

			<Card bodyClassName="px-0 pb-0">
				<AuditTable rows={rows} loading={loading} />
				<div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2 text-xs text-muted">
					<span className="num flex items-center gap-2">
						{formatNumber(total, locale)} • {formatNumber(page + 1, locale)}/{formatNumber(pages, locale)}
						{loading && rows.length > 0 && <Spinner className="h-3.5 w-3.5" />}
					</span>
					<div className="flex gap-1">
						<Button size="icon" variant="ghost" type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
							<ChevronRight className="h-4 w-4 ltr:rotate-180" />
						</Button>
						<Button size="icon" variant="ghost" type="button" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
							<ChevronLeft className="h-4 w-4 ltr:rotate-180" />
						</Button>
					</div>
				</div>
			</Card>

			<Card
				title={L("نگه‌داری و پاکسازی", "Retention & cleanup")}
				subtitle={L("هر شب ساعت ۳:۴۰ اجرا می‌شود؛ فایل‌های پشتیبان دست نمی‌خورند", "Runs nightly at 03:40; backup files are never touched")}
				bodyClassName="space-y-3"
			>
				{form ? (
					<>
						<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
							{keepField(L("فعالیت ادمین (روز)", "Admin activity (days)"), form.auditKeepDays, (n) => setForm((f) => (f ? { ...f, auditKeepDays: n } : f)))}
							{keepField(L("اعلان‌ها (روز)", "Notifications (days)"), form.notifyKeepDays, (n) => setForm((f) => (f ? { ...f, notifyKeepDays: n } : f)))}
							{keepField(L("وب‌هوک (روز)", "Webhooks (days)"), form.webhookKeepDays, (n) => setForm((f) => (f ? { ...f, webhookKeepDays: n } : f)))}
							{keepField(L("رویدادهای بسته (روز)", "Resolved incidents (days)"), form.incidentKeepDays, (n) => setForm((f) => (f ? { ...f, incidentKeepDays: n } : f)))}
						</div>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<button
								type="button"
								onClick={() => setForm((f) => (f ? { ...f, autoPrune: !f.autoPrune } : f))}
								className={cx("chip", form.autoPrune && "chip-on")}
							>
								{L("پاکسازی خودکار شبانه", "Nightly auto-prune")}
							</button>
							<div className="flex gap-2">
								<Button type="button" variant="danger" onClick={pruneNow} disabled={saving}>
									<Trash2 className="h-4 w-4" />
									{L("پاکسازی همین حالا", "Prune now")}
								</Button>
								<Button type="button" variant="primary" onClick={saveSettings} loading={saving}>
									<Save className="h-4 w-4" />
									{L("ذخیره", "Save")}
								</Button>
							</div>
						</div>
					</>
				) : (
					<div className="flex justify-center py-6">
						<Spinner />
					</div>
				)}
			</Card>
		</div>
	)
}
