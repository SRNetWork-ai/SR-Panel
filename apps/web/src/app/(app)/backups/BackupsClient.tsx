"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { DatabaseBackup, Download, HardDrive, Play, RefreshCw, Send, Trash2 } from "lucide-react"
import type { BackupSettings } from "@srpanel/core"
import { api } from "@/lib/client"
import { formatBytes, formatDate } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Select, Spinner, Stat, Switch, useConfirm, useToast } from "@/components/ui"

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
type ListResp = { items: BackupRow[]; disk: { files: number; bytes: number; dir: string }; running: boolean }

const HOURS = Array.from({ length: 24 }, (_, i) => i)

export function BackupsClient({ initial, settings: initialSettings }: { initial: ListResp; settings: BackupSettings }) {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const [data, setData] = useState<ListResp>(initial)
	const [settings, setSettings] = useState<BackupSettings>(initialSettings)
	const [saving, setSaving] = useState(false)
	const [running, setRunning] = useState(false)
	const [loading, setLoading] = useState(false)

	const refresh = useCallback(async () => {
		setLoading(true)
		try {
			setData(await api<ListResp>("/api/backups"))
		} finally {
			setLoading(false)
		}
	}, [])

	// poll while a backup is running
	useEffect(() => {
		if (!data.running) return
		const h = setInterval(refresh, 4000)
		return () => clearInterval(h)
	}, [data.running, refresh])

	async function saveSettings(e: FormEvent) {
		e.preventDefault()
		setSaving(true)
		try {
			setSettings(await api<BackupSettings>("/api/settings/backup", { method: "PUT", json: settings }))
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
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
			toast.err(err instanceof Error ? err.message : t("error_generic"))
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
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		}
	}

	const okCount = data.items.filter((b) => b.status === "OK").length
	const last = data.items.find((b) => b.status === "OK")

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
						<Button size="sm" variant="primary" onClick={runNow} loading={running || data.running}>
							<Play className="h-4 w-4" /> {t("bk_run_now")}
						</Button>
					</div>
				}
			/>

			<div className="grid gap-4 sm:grid-cols-3">
				<Stat label={t("bk_stat_count")} value={okCount} icon={<DatabaseBackup className="h-5 w-5" />} accent="violet" />
				<Stat label={t("bk_stat_disk")} value={formatBytes(data.disk.bytes)} sub={`${data.disk.files} ${t("bk_files")}`} icon={<HardDrive className="h-5 w-5" />} accent="cyan" />
				<Stat label={t("bk_stat_last")} value={last ? formatDate(last.at, locale, true) : "—"} sub={last?.sentToTelegram ? t("bk_sent_tg") : undefined} icon={<Send className="h-5 w-5" />} accent="success" />
			</div>

			<div className="grid gap-4 lg:grid-cols-3">
				<Card title={t("bk_schedule")} subtitle={t("bk_schedule_sub")} className="lg:col-span-1">
					<form onSubmit={saveSettings} className="space-y-4">
						<Switch checked={settings.enabled} onChange={(v) => setSettings({ ...settings, enabled: v })} label={t("bk_enabled")} />
						<Field label={t("bk_hour")} hint={t("bk_hour_hint")}>
							<Select value={settings.hour} onChange={(e) => setSettings({ ...settings, hour: Number(e.target.value) })}>
								{HOURS.map((h) => (
									<option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
								))}
							</Select>
						</Field>
						<Field label={t("bk_keep_last")}>
							<Input type="number" min={1} max={90} value={settings.keepLast} onChange={(e) => setSettings({ ...settings, keepLast: Number(e.target.value) })} />
						</Field>
						<Switch checked={settings.sendToTelegram} onChange={(v) => setSettings({ ...settings, sendToTelegram: v })} label={t("bk_send_tg")} />
						<Button type="submit" variant="primary" loading={saving} className="w-full">
							{t("save")}
						</Button>
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
									{data.items.map((b) => (
										<tr key={b.id}>
											<td className="mono text-xs">{b.fileName}</td>
											<td>
												{b.status === "RUNNING" ? (
													<Badge tone="cyan"><Spinner className="h-3 w-3" /> {t("bk_status_RUNNING")}</Badge>
												) : b.status === "OK" ? (
													<Badge tone="success">{t("bk_status_OK")}</Badge>
												) : (
													<Badge tone="danger">{t("bk_status_FAILED")}</Badge>
												)}
												{b.sentToTelegram && <Send className="ms-2 inline h-3.5 w-3.5 text-cyan" />}
											</td>
											<td className="num">{b.sizeBytes ? formatBytes(b.sizeBytes) : "—"}</td>
											<td><Badge tone={b.trigger === "schedule" ? "violet" : b.trigger === "telegram" ? "cyan" : "muted"}>{t(b.trigger === "schedule" ? "bk_trigger_scheduled" : b.trigger === "telegram" ? "bk_trigger_telegram" : "bk_trigger_manual")}</Badge></td>
											<td className="num whitespace-nowrap">{formatDate(b.at, locale, true)}</td>
											<td className="text-end whitespace-nowrap">
												{b.status === "OK" && (
													<a className="btn btn-ghost btn-sm" href={`/api/backups/${b.id}`} title={t("bk_download")}>
														<Download className="h-4 w-4" />
													</a>
												)}
												{b.status !== "RUNNING" && (
													<Button size="sm" variant="ghost" onClick={() => remove(b)} title={t("delete")}>
														<Trash2 className="h-4 w-4 text-danger" />
													</Button>
												)}
											</td>
										</tr>
									))}
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
				<pre className="mono glass-2 overflow-x-auto rounded-xl p-4 text-xs leading-6" dir="ltr">{`# 1) copy the file next to docker-compose.yml, then:
docker compose stop web worker
gunzip -c srpanel-YYYY-MM-DD.sql.gz | docker compose exec -T db psql -U srpanel -d srpanel
docker compose start web worker`}</pre>
			</Card>
		</div>
	)
}
