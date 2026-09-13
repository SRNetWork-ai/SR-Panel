"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { AlertTriangle, Clock, DatabaseBackup, Download, HardDrive, Play, RefreshCw, RotateCcw, Send, ShieldCheck, Trash2, Wrench } from "lucide-react"
import type { BackupSettings } from "@srpanel/core"
import { api } from "@/lib/client"
import { formatBytes, formatDate, type Locale } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Switch, cx, useConfirm, useToast } from "@/components/ui"
import { MiniStat } from "@/components/bits"

type BackupRow = {
	id: string
	fileName: string
	sizeBytes: number | null
	status: "RUNNING" | "OK" | "FAILED"
	trigger: string
	error: string | null
	sentToTelegram: boolean
	at: string
	finishedAt: string | null
}

type Meta = {
	sha256: string
	sizeBytes: number
	createdAt: string
	trigger: string
	tables: number
	copyBlocks: number
	lastCheckAt?: string
	lastCheckOk?: boolean
	lastCheckError?: string
}

type Check = {
	fileName: string
	ok: boolean
	sizeBytes: number
	sha256: string
	tables: number
	copyBlocks: number
	gzipOk: boolean
	sha256Match: boolean | null
	error?: string
}

type ListResp = {
	items: BackupRow[]
	disk: { files: number; bytes: number; dir: string }
	running: boolean
	restoring: boolean
	meta: Record<string, Meta>
	onDisk: string[]
}

type Health = {
	settings: BackupSettings
	times: number[]
	nextRunAt: string | null
	running: boolean
	restoring: boolean
	total: number
	okCount: number
	failed7d: number
	lastOk: { id: string; at: string; fileName: string; sizeBytes: number | null } | null
	lastFail: { id: string; at: string; error: string | null } | null
	ageHours: number | null
	stale: boolean
	disk: { files: number; bytes: number; dir: string; ok: boolean }
	orphanFiles: string[]
	missingFiles: string[]
	lastCheck: { at: string; ok: boolean; fileName: string; error: string } | null
}

type Cleaned = { staleRuns: number; missingRows: number; oldFailed: number; sidecars: number; imported: number }
type Restored = { fileName: string; safetyBackupId: string | null; durationMs: number; imported: number }

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const tr = (locale: Locale, fa: string, en: string) => (locale === "fa" ? fa : en)
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`

export function BackupsClient({ initial, settings: initialSettings, health: initialHealth }: { initial: ListResp; settings: BackupSettings; health: Health }) {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const [data, setData] = useState<ListResp>(initial)
	const [health, setHealth] = useState<Health>(initialHealth)
	const [settings, setSettings] = useState<BackupSettings>(initialSettings)
	const [saving, setSaving] = useState(false)
	const [running, setRunning] = useState(false)
	const [loading, setLoading] = useState(false)
	const [busy, setBusy] = useState<string | null>(null)
	const [check, setCheck] = useState<Check | null>(null)
	const [restoreFor, setRestoreFor] = useState<BackupRow | null>(null)
	const [restoreName, setRestoreName] = useState("")
	const [safety, setSafety] = useState(true)
	const [restoring, setRestoring] = useState(false)

	const refresh = useCallback(async () => {
		setLoading(true)
		try {
			const [list, h] = await Promise.all([api<ListResp>("/api/backups"), api<Health>("/api/backups/health")])
			setData(list)
			setHealth(h)
		} finally {
			setLoading(false)
		}
	}, [])

	// poll while a backup or a restore is in flight
	useEffect(() => {
		if (!data.running && !data.restoring) return
		const h = setInterval(refresh, 4000)
		return () => clearInterval(h)
	}, [data.running, data.restoring, refresh])

	const fail = (err: unknown) => toast.err(err instanceof Error ? err.message : t("error_generic"))

	async function saveSettings(e: FormEvent) {
		e.preventDefault()
		setSaving(true)
		try {
			setSettings(await api<BackupSettings>("/api/settings/backup", { method: "PUT", json: settings }))
			toast.ok(t("set_saved"))
			await refresh()
		} catch (err) {
			fail(err)
		} finally {
			setSaving(false)
		}
	}

	async function runNow() {
		setRunning(true)
		try {
			const r = await api<{ backup: BackupRow }>("/api/backups", { method: "POST" })
			if (r.backup.status === "OK") toast.ok(t("bk_done"))
			else toast.err(r.backup.error || t("bk_failed"))
			await refresh()
		} catch (err) {
			fail(err)
		} finally {
			setRunning(false)
		}
	}

	async function remove(row: BackupRow) {
		if (!confirm(t("confirm_delete"))) return
		try {
			await api(`/api/backups/${row.id}`, { method: "DELETE" })
			toast.ok(t("bk_deleted"))
			await refresh()
		} catch (err) {
			fail(err)
		}
	}

	async function verify(row: BackupRow) {
		setBusy(row.id)
		try {
			const r = await api<Check>(`/api/backups/${row.id}/verify`, { method: "POST" })
			setCheck(r)
			if (r.ok) toast.ok(tr(locale, "بکاپ سالم است", "Backup is healthy"))
			else toast.err(r.error || tr(locale, "بکاپ سالم نیست", "Backup is damaged"))
			await refresh()
		} catch (err) {
			fail(err)
		} finally {
			setBusy(null)
		}
	}

	async function housekeeping(reindex: boolean) {
		setBusy(reindex ? "reindex" : "cleanup")
		try {
			const r = await api<Cleaned>("/api/backups/cleanup", { method: "POST", json: { reindex } })
			const removed = r.staleRuns + r.missingRows + r.oldFailed + r.sidecars
			const fa = `پاک‌سازی انجام شد — ${removed} مورد حذف، ${r.imported} فایل بازنمایه‌شده`
			const en = `Cleanup done — ${removed} removed, ${r.imported} imported`
			toast.ok(tr(locale, fa, en))
			await refresh()
		} catch (err) {
			fail(err)
		} finally {
			setBusy(null)
		}
	}

	async function doRestore() {
		if (!restoreFor) return
		setRestoring(true)
		try {
			const r = await api<Restored>(`/api/backups/${restoreFor.id}/restore`, { method: "POST", json: { fileName: restoreName.trim(), safetyBackup: safety } })
			const secs = Math.max(1, Math.round(r.durationMs / 1000))
			toast.ok(tr(locale, `بازگردانی انجام شد (${secs} ثانیه) — سرویس‌ها را ریستارت کنید`, `Restore finished in ${secs}s — restart the containers`))
			setRestoreFor(null)
			setRestoreName("")
			await refresh()
		} catch (err) {
			fail(err)
		} finally {
			setRestoring(false)
		}
	}

	function toggleHour(h: number) {
		const cur = settings.extraHours ?? []
		const next = cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h].slice(0, 11)
		setSettings({ ...settings, extraHours: [...next].sort((a, b) => a - b) })
	}

	const onDisk = new Set(data.onDisk)
	const last = health.lastOk
	const busyAll = data.running || data.restoring || restoring
	const ageText = health.ageHours === null ? "—" : tr(locale, `${health.ageHours} ساعت پیش`, `${health.ageHours}h ago`)

	return (
		<div className="space-y-6 fade-up">
			<PageHeader
				title={t("bk_title")}
				subtitle={t("bk_sub")}
				actions={
					<div className="flex items-center gap-2">
						<Button size="sm" onClick={refresh} loading={loading}>
							<RefreshCw className="h-4 w-4" /> {t("refresh")}
						</Button>
						<Button size="sm" variant="primary" onClick={runNow} loading={running || data.running} disabled={data.restoring}>
							<Play className="h-4 w-4" /> {t("bk_run_now")}
						</Button>
					</div>
				}
			/>

			{(health.stale || !health.disk.ok || health.missingFiles.length > 0 || data.restoring) && (
				<div className="glass-2 flex flex-wrap items-center gap-3 rounded-2xl border border-warning/30 p-4 text-sm">
					{data.restoring ? <Spinner className="h-4 w-4" /> : <AlertTriangle className="h-5 w-5 text-warning" />}
					<div className="space-y-1">
						{data.restoring && <div>{tr(locale, "بازگردانی دیتابیس در جریان است؛ صفحه را نبندید.", "A database restore is running — keep this page open.")}</div>}
						{health.stale && <div>{tr(locale, `آخرین بکاپ سالم ${ageText} است (آستانه: ${health.settings.staleAfterHours} ساعت).`, `Newest healthy backup is ${ageText} (threshold ${health.settings.staleAfterHours}h).`)}</div>}
						{!health.disk.ok && <div>{tr(locale, "پوشه بکاپ در دسترس نیست.", "The backup directory is not readable.")}</div>}
						{health.missingFiles.length > 0 && <div>{tr(locale, `${health.missingFiles.length} رکورد بدون فایل روی دیسک.`, `${health.missingFiles.length} rows have no file on disk.`)}</div>}
						{health.lastFail && <div className="mono text-xs text-danger">{(health.lastFail.error || "").slice(0, 200)}</div>}
					</div>
				</div>
			)}

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Stat label={t("bk_stat_count")} value={health.okCount} icon={<DatabaseBackup className="h-5 w-5" />} accent="violet" />
				<Stat label={t("bk_stat_disk")} value={formatBytes(data.disk.bytes)} sub={`${data.disk.files} ${t("bk_files")}`} icon={<HardDrive className="h-5 w-5" />} accent="cyan" />
				<Stat label={t("bk_stat_last")} value={last ? formatDate(last.at, locale, true) : "—"} sub={ageText} icon={<Send className="h-5 w-5" />} accent="success" />
				<Stat label={tr(locale, "اجرای بعدی", "Next run")} value={health.nextRunAt ? formatDate(health.nextRunAt, locale, true) : "—"} sub={health.times.map(hh).join(" · ")} icon={<Clock className="h-5 w-5" />} accent="cyan" />
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MiniStat icon={<ShieldCheck className="h-4 w-4" />} label={tr(locale, "آخرین بررسی سلامت", "Last integrity check")} value={health.lastCheck ? formatDate(health.lastCheck.at, locale, true) : "—"} tone={health.lastCheck ? (health.lastCheck.ok ? "success" : "danger") : "muted"} />
				<MiniStat icon={<AlertTriangle className="h-4 w-4" />} label={tr(locale, "ناموفق ۷ روز", "Failed (7d)")} value={health.failed7d} tone={health.failed7d ? "danger" : "success"} />
				<MiniStat icon={<HardDrive className="h-4 w-4" />} label={tr(locale, "فایل بدون رکورد", "Orphan files")} value={health.orphanFiles.length} tone={health.orphanFiles.length ? "warning" : "muted"} />
				<MiniStat icon={<DatabaseBackup className="h-4 w-4" />} label={tr(locale, "رکورد بدون فایل", "Missing files")} value={health.missingFiles.length} tone={health.missingFiles.length ? "danger" : "muted"} />
			</div>

			<div className="grid gap-4 lg:grid-cols-3">
				<Card title={t("bk_schedule")} subtitle={t("bk_schedule_sub")} className="lg:col-span-1">
					<form onSubmit={saveSettings} className="space-y-4">
						<Switch checked={settings.enabled} onChange={(v) => setSettings({ ...settings, enabled: v })} label={t("bk_enabled")} />
						<Field label={t("bk_hour")} hint={t("bk_hour_hint")}>
							<Select value={settings.hour} onChange={(e) => setSettings({ ...settings, hour: Number(e.target.value) })}>
								{HOURS.map((h) => (
									<option key={h} value={h}>{hh(h)}</option>
								))}
							</Select>
						</Field>
						<Field label={tr(locale, "ساعت‌های اضافی", "Extra hours")} hint={tr(locale, "برای چند بکاپ در روز (حداکثر ۱۱ ساعت اضافه)", "For multiple backups per day (max 11 extra)")}>
							<div className="flex flex-wrap gap-1.5">
								{HOURS.map((h) => {
									const primary = h === settings.hour
									const on = primary || (settings.extraHours ?? []).includes(h)
									return (
										<button key={h} type="button" disabled={primary} onClick={() => toggleHour(h)} className={cx("chip", on && "chip-on", primary && "opacity-60")}>
											{hh(h)}
										</button>
									)
								})}
							</div>
						</Field>
						<div className="grid gap-3 sm:grid-cols-2">
							<Field label={t("bk_keep_last")}>
								<Input type="number" min={1} max={90} value={settings.keepLast} onChange={(e) => setSettings({ ...settings, keepLast: Number(e.target.value) })} />
							</Field>
							<Field label={tr(locale, "نگهداری (روز)", "Keep days")} hint={tr(locale, "۰ = غیرفعال", "0 = off")}>
								<Input type="number" min={0} max={365} value={settings.keepDays ?? 0} onChange={(e) => setSettings({ ...settings, keepDays: Number(e.target.value) })} />
							</Field>
						</div>
						<Field label={tr(locale, "هشدار قدمت بکاپ (ساعت)", "Stale warning (hours)")} hint={tr(locale, "اگر بکاپ سالمی قدیمی‌تر از این باشد هشدار داده می‌شود", "Warn when the newest healthy backup is older")}>
							<Input type="number" min={0} max={720} value={settings.staleAfterHours ?? 48} onChange={(e) => setSettings({ ...settings, staleAfterHours: Number(e.target.value) })} />
						</Field>
						<Switch checked={settings.verify ?? true} onChange={(v) => setSettings({ ...settings, verify: v })} label={tr(locale, "بررسی سلامت پس از هر بکاپ", "Verify each new backup")} />
						<Switch checked={settings.autoCleanup ?? true} onChange={(v) => setSettings({ ...settings, autoCleanup: v })} label={tr(locale, "خانه‌تکانی خودکار", "Automatic housekeeping")} />
						<Switch checked={settings.sendToTelegram} onChange={(v) => setSettings({ ...settings, sendToTelegram: v })} label={t("bk_send_tg")} />
						<Button type="submit" variant="primary" loading={saving} className="w-full">
							{t("save")}
						</Button>
						<div className="flex gap-2 border-t border-white/5 pt-3">
							<Button size="sm" onClick={() => housekeeping(false)} loading={busy === "cleanup"} className="flex-1">
								<Wrench className="h-4 w-4" /> {tr(locale, "پاک‌سازی", "Cleanup")}
							</Button>
							<Button size="sm" onClick={() => housekeeping(true)} loading={busy === "reindex"} className="flex-1">
								<RefreshCw className="h-4 w-4" /> {tr(locale, "بازنمایه‌سازی", "Reindex")}
							</Button>
						</div>
					</form>
				</Card>

				<Card title={t("bk_list")} subtitle={data.disk.dir} className="lg:col-span-2" bodyClassName="px-0 pb-0">
					{data.items.length === 0 ? (
						<div className="px-5 pb-5">
							<Empty text={t("bk_empty")} />
						</div>
					) : (
						<div className="table-wrap">
							<table className="table">
								<thead>
									<tr>
										<th>{t("bk_col_file")}</th>
										<th>{t("bk_col_status")}</th>
										<th>{t("bk_col_size")}</th>
										<th>{t("bk_col_trigger")}</th>
										<th>{t("bk_col_date")}</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{data.items.map((b) => {
										const meta = data.meta[b.id]
										const has = onDisk.has(b.id)
										return (
											<tr key={b.id}>
												<td className="mono text-xs">
													<div>{b.fileName}</div>
													{meta ? <div className="text-muted">{`sha ${meta.sha256.slice(0, 10)} · ${meta.tables} tbl`}</div> : null}
												</td>
												<td>
													{b.status === "RUNNING" ? (
														<Badge tone="cyan"><Spinner className="h-3 w-3" /> {t("bk_status_RUNNING")}</Badge>
													) : b.status === "OK" ? (
														<Badge tone={has ? "success" : "muted"}>{t("bk_status_OK")}</Badge>
													) : (
														<Badge tone="danger">{t("bk_status_FAILED")}</Badge>
													)}
													{meta?.lastCheckAt ? <Badge tone={meta.lastCheckOk ? "success" : "danger"}>{meta.lastCheckOk ? tr(locale, "سالم", "verified") : tr(locale, "خراب", "damaged")}</Badge> : null}
													{b.sentToTelegram && <Send className="ms-2 inline h-3.5 w-3.5 text-cyan" />}
												</td>
												<td className="num">{b.sizeBytes ? formatBytes(b.sizeBytes) : "—"}</td>
												<td><Badge tone={b.trigger === "schedule" ? "violet" : b.trigger === "telegram" ? "cyan" : "muted"}>{t(b.trigger === "schedule" ? "bk_trigger_scheduled" : b.trigger === "telegram" ? "bk_trigger_telegram" : "bk_trigger_manual")}</Badge></td>
												<td className="num whitespace-nowrap">{formatDate(b.at, locale, true)}</td>
												<td className="text-end whitespace-nowrap">
													{b.status === "OK" && has && (
														<>
															<Button size="sm" variant="ghost" onClick={() => verify(b)} loading={busy === b.id} title={tr(locale, "بررسی سلامت", "Verify")}>
																<ShieldCheck className="h-4 w-4" />
															</Button>
															<Button size="sm" variant="ghost" onClick={() => { setRestoreFor(b); setRestoreName(""); setSafety(true) }} disabled={busyAll} title={tr(locale, "بازگردانی", "Restore")}>
																<RotateCcw className="h-4 w-4 text-warning" />
															</Button>
															<a className="btn btn-ghost btn-sm" href={`/api/backups/${b.id}`} title={t("bk_download")}>
																<Download className="h-4 w-4" />
															</a>
														</>
													)}
													{b.status !== "RUNNING" && (
														<Button size="sm" variant="ghost" onClick={() => remove(b)} title={t("delete")}>
															<Trash2 className="h-4 w-4 text-danger" />
														</Button>
													)}
												</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					)}
					{data.items.some((b) => b.status === "FAILED" && b.error) && (
						<div className="mono border-t border-white/5 px-5 py-3 text-xs text-danger">{data.items.find((b) => b.status === "FAILED" && b.error)?.error}</div>
					)}
				</Card>
			</div>

			<Card title={t("bk_restore")} subtitle={t("bk_restore_sub")}>
				<p className="mb-3 text-sm text-muted">{tr(locale, "بازگردانی از داخل پنل با دکمه بازگردانی هر ردیف انجام می‌شود. روش دستی برای مواقعی است که پنل بالا نمی‌آید:", "Use the restore button on any row. The manual path below is for when the panel itself will not start:")}</p>
				<pre className="mono glass-2 overflow-x-auto rounded-xl p-4 text-xs leading-6" dir="ltr">{`# copy the file next to docker-compose.yml, then:
docker compose stop web worker
gunzip -c srpanel-YYYYMMDD-HHMM.sql.gz | docker compose exec -T db psql -U srpanel -d srpanel
docker compose start web worker`}</pre>
			</Card>

			<Modal open={Boolean(check)} onClose={() => setCheck(null)} title={tr(locale, "نتیجه بررسی سلامت", "Integrity check")}>
				{check ? (
					<div className="space-y-2 text-sm">
						<div className="mono text-xs">{check.fileName}</div>
						<div className="flex flex-wrap gap-2">
							<Badge tone={check.ok ? "success" : "danger"}>{check.ok ? tr(locale, "سالم", "healthy") : tr(locale, "خراب", "damaged")}</Badge>
							<Badge tone={check.gzipOk ? "success" : "danger"}>gzip</Badge>
							<Badge tone={check.sha256Match === false ? "danger" : check.sha256Match ? "success" : "muted"}>sha256</Badge>
						</div>
						<div className="grid gap-2 sm:grid-cols-2">
							<MiniStat icon={<DatabaseBackup className="h-4 w-4" />} label={tr(locale, "جداول", "Tables")} value={check.tables} tone="violet" />
							<MiniStat icon={<HardDrive className="h-4 w-4" />} label={tr(locale, "حجم", "Size")} value={formatBytes(check.sizeBytes)} tone="cyan" />
						</div>
						<div className="mono break-all text-xs text-muted">{check.sha256}</div>
						{check.error ? <div className="text-xs text-danger">{check.error}</div> : null}
					</div>
				) : null}
			</Modal>

			<Modal
				open={Boolean(restoreFor)}
				onClose={() => setRestoreFor(null)}
				title={tr(locale, "بازگردانی دیتابیس", "Restore database")}
				footer={
					<div className="flex justify-end gap-2">
						<Button onClick={() => setRestoreFor(null)}>{tr(locale, "انصراف", "Cancel")}</Button>
						<Button variant="danger" loading={restoring} disabled={restoreName.trim() !== restoreFor?.fileName} onClick={doRestore}>
							<RotateCcw className="h-4 w-4" /> {tr(locale, "بازگردانی", "Restore")}
						</Button>
					</div>
				}
			>
				<div className="space-y-3 text-sm">
					<div className="rounded-xl border border-danger/30 bg-danger/10 p-3">
						{tr(locale, "تمام داده‌های فعلی با محتوای این بکاپ جایگزین می‌شود. پس از پایان، کانتینرهای web و worker را ریستارت کنید.", "Everything in the current database is replaced by this backup. Restart the web and worker containers afterwards.")}
					</div>
					<div className="mono text-xs">{restoreFor?.fileName}</div>
					<Field label={tr(locale, "برای تأیید، نام فایل را دقیق بنویسید", "Type the exact file name to confirm")}>
						<Input value={restoreName} onChange={(e) => setRestoreName(e.target.value)} dir="ltr" className="mono" />
					</Field>
					<Switch checked={safety} onChange={setSafety} label={tr(locale, "اول یک بکاپ ایمنی بگیر", "Take a safety backup first")} />
				</div>
			</Modal>
		</div>
	)
}
