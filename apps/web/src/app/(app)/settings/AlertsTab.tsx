"use client"

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import Link from "next/link"
import { Activity, AlertTriangle, ArrowDownToLine, Bell, Clock, Cpu, DatabaseBackup, Download, Plug, RefreshCw, Save, ScrollText, Settings2, Upload } from "lucide-react"
import type { BackupSettings, LogSettings, MonitoringSettings, UpdateSettings } from "@srpanel/core"
import { api } from "@/lib/client"
import { useLocale } from "@/lib/i18n"
import { Badge, Button, Field, Input, Spinner, cx, useConfirm, useToast } from "@/components/ui"
import { MiniStat } from "@/components/bits"
import { Row, Section } from "@/components/parts"
import { LoginGuardCard } from "./LoginGuardCard"
import { downloadText, errMsg, tr } from "./types"

type TelegramPolicy = { enabled: boolean; botEnabled: boolean; hasToken: boolean }
type Overview = { backup: BackupSettings | null; logs: LogSettings | null; updates: UpdateSettings | null; telegram: TelegramPolicy | null }
type Bundle = { kind?: string; version?: number; exportedAt?: string; settings?: Record<string, unknown> }

const DAY_CHOICES = [1, 2, 3, 5, 7, 10, 14, 30]
const PCT_CHOICES = [50, 60, 70, 75, 80, 85, 90, 95]
const MAX_PICKS = 5

/** Keeps the picked list sorted and inside the 5-item limit the API enforces. */
function togglePick(list: number[], n: number) {
	if (list.includes(n)) return list.filter((x) => x !== n)
	if (list.length >= MAX_PICKS) return list
	return [...list, n].sort((a, b) => a - b)
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(v || 0)))

export function AlertsTab() {
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const confirm = useConfirm()
	const fileRef = useRef<HTMLInputElement>(null)
	const [form, setForm] = useState<MonitoringSettings | null>(null)
	const [over, setOver] = useState<Overview>({ backup: null, logs: null, updates: null, telegram: null })
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [busy, setBusy] = useState(false)

	const load = useCallback(async () => {
		setLoading(true)
		const [mon, backup, logs, updates, telegram] = await Promise.allSettled([
			api<MonitoringSettings>("/api/settings/monitoring"),
			api<BackupSettings>("/api/settings/backup"),
			api<LogSettings>("/api/logs/settings"),
			api<{ settings: UpdateSettings }>("/api/system/update-settings"),
			api<TelegramPolicy>("/api/settings/telegram"),
		])
		if (mon.status === "fulfilled") setForm(mon.value)
		setOver({
			backup: backup.status === "fulfilled" ? backup.value : null,
			logs: logs.status === "fulfilled" ? logs.value : null,
			updates: updates.status === "fulfilled" ? updates.value.settings : null,
			telegram: telegram.status === "fulfilled" ? telegram.value : null,
		})
		setLoading(false)
	}, [])

	useEffect(() => {
		void load()
	}, [load])

	async function save() {
		if (!form) return
		setSaving(true)
		try {
			setForm(await api<MonitoringSettings>("/api/settings/monitoring", { method: "PUT", json: form }))
			toast.ok(L("آستانه‌های هشدار ذخیره شد", "Alert thresholds saved"))
		} catch (err) {
			toast.err(errMsg(err, L("خطا در ذخیره", "Save failed")))
		} finally {
			setSaving(false)
		}
	}

	async function exportBundle() {
		setBusy(true)
		try {
			const data = await api<Bundle>("/api/settings/bundle")
			downloadText(`srpanel-settings-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2))
			toast.ok(L("فایل تنظیمات دانلود شد", "Settings file downloaded"))
		} catch (err) {
			toast.err(errMsg(err, L("خطا در ساخت فایل", "Export failed")))
		} finally {
			setBusy(false)
		}
	}

	async function importBundle(file: File) {
		let parsed: Bundle | null = null
		try {
			parsed = JSON.parse(await file.text()) as Bundle
		} catch {
			parsed = null
		}
		if (!parsed || typeof parsed !== "object" || !parsed.settings) {
			toast.err(L("این فایل تنظیمات پنل نیست", "Not a panel settings file"))
			return
		}
		if (!confirm(L("سیاست‌های فعلی پنل با محتوای این فایل جایگزین شود؟", "Replace the current panel policies with this file?"))) return
		setBusy(true)
		try {
			const r = await api<{ applied: string[] }>("/api/settings/bundle", { method: "POST", json: parsed })
			toast.ok(L(`${r.applied.length} بخش بازیابی شد`, `${r.applied.length} sections restored`))
			await load()
		} catch (err) {
			toast.err(errMsg(err, L("خطا در بازیابی", "Import failed")))
		} finally {
			setBusy(false)
		}
	}

	function onFile(e: ChangeEvent<HTMLInputElement>) {
		const f = e.target.files?.[0]
		e.target.value = ""
		if (f) void importBundle(f)
	}

	const b = over.backup
	const lg = over.logs
	const up = over.updates
	const tg = over.telegram

	const policies = [
		{
			id: "backup",
			icon: DatabaseBackup,
			href: "/backups",
			label: L("پشتیبان‌گیری", "Backups"),
			value: b ? (b.enabled ? L(`ساعت ${b.hour} • ${b.keepLast} نسخه`, `At ${b.hour}:00 • keep ${b.keepLast}`) : L("غیرفعال", "Disabled")) : "—",
			tone: b ? (b.enabled ? "success" : "warning") : "muted",
		},
		{
			id: "logs",
			icon: ScrollText,
			href: "/audit",
			label: L("نگه‌داری لاگ", "Log retention"),
			value: lg ? (lg.autoPrune ? L(`پاکسازی شبانه • ${lg.auditKeepDays} روز`, `Nightly • ${lg.auditKeepDays}d`) : L("پاکسازی خودکار خاموش", "Auto-prune off")) : "—",
			tone: lg ? (lg.autoPrune ? "success" : "warning") : "muted",
		},
		{
			id: "updates",
			icon: ArrowDownToLine,
			href: "/updates",
			label: L("به‌روزرسانی خودکار", "Auto update"),
			value: up
				? up.autoCheck
					? L(`هر ${up.checkEveryHours} ساعت${up.autoInstall ? ` • نصب ${up.installHour}` : ""}`, `Every ${up.checkEveryHours}h${up.autoInstall ? ` • install ${up.installHour}:00` : ""}`)
					: L("بررسی خودکار خاموش", "Auto-check off")
				: "—",
			tone: up ? (up.autoCheck ? "success" : "warning") : "muted",
		},
		{
			id: "telegram",
			icon: Plug,
			href: "/integrations",
			label: L("اعلان تلگرام", "Telegram alerts"),
			value: tg ? (tg.enabled && tg.hasToken ? L("فعال", "Active") : L("پیکربندی نشده", "Not configured")) : "—",
			tone: tg ? (tg.enabled && tg.hasToken ? "success" : "warning") : "muted",
		},
	] as const

	if (loading && !form) {
		return (
			<div className="flex justify-center py-10">
				<Spinner />
			</div>
		)
	}

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<MiniStat icon={<AlertTriangle className="h-4 w-4" />} label={L("آستانه خرابی", "Fail threshold")} value={form ? `${form.failThreshold}×` : "—"} tone="warning" />
				<MiniStat icon={<Cpu className="h-4 w-4" />} label={L("آستانه CPU", "CPU threshold")} value={form ? `${form.cpuThreshold}%` : "—"} tone="violet" />
				<MiniStat icon={<Clock className="h-4 w-4" />} label={L("یادآوری انقضا", "Expiry reminders")} value={form && form.expiryReminderDays.length ? form.expiryReminderDays.join(" / ") : L("خاموش", "Off")} tone="cyan" />
				<MiniStat icon={<Activity className="h-4 w-4" />} label={L("یادآوری ترافیک", "Traffic reminders")} value={form && form.trafficReminderPct.length ? `${form.trafficReminderPct.join(" / ")}%` : L("خاموش", "Off")} tone="success" />
			</div>

			<Section
				icon={Bell}
				title={L("آستانه‌های هشدار", "Alert thresholds")}
				subtitle={L("تعیین می‌کند چه زمانی رویداد سرور باز شود و یادآوری مشتری ارسال گردد", "When a server incident opens and when customers get reminded")}
				actions={
					<div className="flex gap-2">
						<Button type="button" size="sm" variant="ghost" onClick={() => void load()} loading={loading}>
							<RefreshCw className="h-4 w-4" />
							{L("تازه‌سازی", "Refresh")}
						</Button>
						<Button type="button" size="sm" variant="primary" onClick={() => void save()} loading={saving} disabled={!form}>
							<Save className="h-4 w-4" />
							{L("ذخیره", "Save")}
						</Button>
					</div>
				}
			>
				{form ? (
					<div className="space-y-4">
						<div className="grid gap-3 sm:grid-cols-2">
							<Field label={L("خطای پیاپی تا باز شدن رویداد", "Failed checks before an incident")} hint={L("بین ۱ تا ۱۰ بار", "Between 1 and 10")}>
								<Input type="number" min={1} max={10} value={String(form.failThreshold)} onChange={(e) => setForm({ ...form, failThreshold: clamp(Number(e.target.value), 1, 10) })} />
							</Field>
							<Field label={L("آستانه مصرف CPU سرور (٪)", "Server CPU threshold (%)")} hint={L("بین ۵۰ تا ۱۰۰ درصد", "Between 50 and 100")}>
								<Input type="number" min={50} max={100} value={String(form.cpuThreshold)} onChange={(e) => setForm({ ...form, cpuThreshold: clamp(Number(e.target.value), 50, 100) })} />
							</Field>
						</div>

						<div>
							<div className="mb-1.5 text-xs text-muted">{L("یادآوری انقضا — چند روز مانده به پایان (حداکثر ۵ مورد)", "Expiry reminder — days left (max 5)")}</div>
							<div className="flex flex-wrap gap-1.5">
								{DAY_CHOICES.map((d) => (
									<button key={d} type="button" className={cx("chip", form.expiryReminderDays.includes(d) && "chip-on")} onClick={() => setForm({ ...form, expiryReminderDays: togglePick(form.expiryReminderDays, d) })}>
										{L(`${d} روز`, `${d}d`)}
									</button>
								))}
							</div>
						</div>

						<div>
							<div className="mb-1.5 text-xs text-muted">{L("یادآوری ترافیک — درصد مصرف (حداکثر ۵ مورد)", "Traffic reminder — usage percent (max 5)")}</div>
							<div className="flex flex-wrap gap-1.5">
								{PCT_CHOICES.map((p) => (
									<button key={p} type="button" className={cx("chip", form.trafficReminderPct.includes(p) && "chip-on")} onClick={() => setForm({ ...form, trafficReminderPct: togglePick(form.trafficReminderPct, p) })}>
										{p}%
									</button>
								))}
							</div>
						</div>

						<p className="text-[11px] text-muted">
							{L("سرویس پس‌زمینه تا ۳۰ ثانیه بعد تغییر را می‌گیرد؛ یادآوری‌ها هر روز ساعت ۷ صبح و فقط یک‌بار برای هر آستانه ارسال می‌شوند.", "Background services pick the change up within 30s; reminders run daily at 07:00 and fire once per threshold.")}
						</p>
					</div>
				) : (
					<p className="text-xs text-danger">{L("خواندن تنظیمات پایش ممکن نشد.", "Could not load monitoring settings.")}</p>
				)}
			</Section>

			<LoginGuardCard />

			<div className="grid gap-4 xl:grid-cols-2">
				<Section icon={Settings2} title={L("سیاست‌های پنل", "Panel policies")} subtitle={L("خلاصهٔ تنظیماتی که در صفحه‌های دیگر ویرایش می‌شوند", "A summary of settings edited on other pages")}>
					{policies.map((p) => (
						<Row
							key={p.id}
							label={
								<span className="flex items-center gap-1.5">
									<p.icon className="h-3.5 w-3.5" />
									{p.label}
								</span>
							}
						>
							<span className="flex items-center justify-end gap-2">
								<Badge tone={p.tone}>{p.value}</Badge>
								<Link href={p.href} className="text-[11px] text-muted underline-offset-2 hover:underline">
									{L("ویرایش", "Edit")}
								</Link>
							</span>
						</Row>
					))}
				</Section>

				<Section icon={Download} title={L("پشتیبان تنظیمات", "Settings backup")} subtitle={L("یک فایل JSON برای انتقال سیاست‌ها به نصب دیگر", "One JSON file to carry the policies to another install")}>
					<div className="flex flex-wrap gap-2">
						<Button type="button" onClick={() => void exportBundle()} loading={busy}>
							<Download className="h-4 w-4" />
							{L("دانلود فایل", "Download")}
						</Button>
						<Button type="button" variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
							<Upload className="h-4 w-4" />
							{L("بازیابی از فایل", "Restore from file")}
						</Button>
						<input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
					</div>
					<ul className="mt-3 space-y-1 text-[11px] text-muted">
						<li>{L("شامل: آستانه‌های هشدار، بکاپ، نگه‌داری لاگ، به‌روزرسانی و کلیدهای اعلان تلگرام.", "Includes alert thresholds, backup, log retention, updates and the Telegram notification switches.")}</li>
						<li>{L("توکن ربات، ادمین‌ها، سرورها و مشتری‌ها در این فایل نیستند و تغییر نمی‌کنند.", "The bot token, admins, servers and customers are not in this file and stay untouched.")}</li>
					</ul>
				</Section>
			</div>
		</div>
	)
}
