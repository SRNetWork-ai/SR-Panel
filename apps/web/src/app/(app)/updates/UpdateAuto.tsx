"use client"

import { useCallback, useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button, Card, Field, Select, Switch, useToast } from "@/components/ui"
import { api } from "@/lib/client"
import { formatDate } from "@/lib/format"
import { useLocale } from "@/lib/i18n"

type Settings = { autoCheck: boolean; checkEveryHours: number; notify: boolean; autoInstall: boolean; installHour: number }
type LastRun = { at: string; ok: boolean; durationSec: number; buildSec: number; skippedBuild: boolean; toVersion: string } | null
type Payload = { settings: Settings; lastRun: LastRun }

const EVERY = [1, 3, 6, 12, 24]
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function human(sec: number, fa: boolean): string {
	if (!Number.isFinite(sec) || sec <= 0) return fa ? "کمتر از یک ثانیه" : "< 1s"
	const m = Math.floor(sec / 60)
	const s = sec % 60
	if (fa) return m ? `${m} دقیقه و ${s} ثانیه` : `${s} ثانیه`
	return m ? `${m}m ${s}s` : `${s}s`
}

/** Owner-only policy for the host agent: when to look for a new version and what to do with it. */
export function UpdateAuto() {
	const locale = useLocale()
	const fa = locale === "fa"
	const toast = useToast()
	const [data, setData] = useState<Payload | null>(null)
	const [saving, setSaving] = useState(false)

	const load = useCallback(async () => {
		try {
			setData(await api<Payload>("/api/system/update-settings", { method: "GET" }))
		} catch {
			/* the card simply stays hidden when the endpoint is unreachable */
		}
	}, [])

	useEffect(() => {
		void load()
	}, [load])

	const save = async (patch: Partial<Settings>) => {
		setSaving(true)
		try {
			setData(await api<Payload>("/api/system/update-settings", { method: "PUT", json: patch }))
			toast.ok(fa ? "ذخیره شد" : "Saved")
		} catch (err) {
			toast.err(err instanceof Error ? err.message : fa ? "ذخیره نشد" : "Could not save")
		} finally {
			setSaving(false)
		}
	}

	if (!data) return null
	const s = data.settings
	const last = data.lastRun

	return (
		<Card
			title={fa ? "بروزرسانی خودکار" : "Automatic updates"}
			subtitle={fa ? "بررسی دوره‌ای نسخهٔ جدید، اطلاع در تلگرام و نصب در ساعت دلخواه" : "Periodic check, Telegram alert and an optional install window"}
			actions={
				<Button size="icon" variant="ghost" onClick={() => void load()} title={fa ? "تازه‌سازی" : "Refresh"}>
					<RefreshCw className="h-4 w-4" />
				</Button>
			}
		>
			<div className="grid gap-5 sm:grid-cols-2">
				<div className="space-y-3">
					<Switch checked={s.autoCheck} onChange={(v) => void save({ autoCheck: v })} label={fa ? "خودکار دنبال نسخهٔ جدید بگرد" : "Check for updates automatically"} />
					<Switch checked={s.notify} onChange={(v) => void save({ notify: v })} label={fa ? "وقتی نسخهٔ جدید آمد در تلگرام خبر بده" : "Telegram alert on a new version"} />
					<Switch checked={s.autoInstall} onChange={(v) => void save({ autoInstall: v })} label={fa ? "نصب خودکار در ساعت مشخص" : "Install automatically at a set hour"} />
					<p className="text-[11px] text-muted">
						{fa
							? "نصب خودکار فقط وقتی اجرا می‌شود که نسخهٔ جدیدی موجود باشد؛ اگر بیلد شکست بخورد سرویس به نسخهٔ قبلی برمی‌گردد."
							: "An automatic install only runs when a newer version is waiting; a failed build is rolled back to the previous version."}
					</p>
				</div>
				<div className="grid gap-3">
					<Field label={fa ? "هر چند وقت بررسی شود" : "Check every"}>
						<Select value={s.checkEveryHours} disabled={!s.autoCheck || saving} onChange={(e) => void save({ checkEveryHours: Number(e.target.value) })}>
							{EVERY.map((h) => (
								<option key={h} value={h}>
									{fa ? `هر ${h} ساعت` : `every ${h}h`}
								</option>
							))}
						</Select>
					</Field>
					<Field label={fa ? "ساعت نصب خودکار" : "Install hour"} hint={fa ? "ساعت محلی سرور" : "Server local time"}>
						<Select value={s.installHour} disabled={!s.autoInstall || saving} onChange={(e) => void save({ installHour: Number(e.target.value) })}>
							{HOURS.map((h) => (
								<option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
							))}
						</Select>
					</Field>
				</div>
			</div>
			<p className="mt-4 text-[11px] text-muted">
				{last
					? fa
						? `آخرین بروزرسانی: ${formatDate(last.at, locale, true)} — ${last.ok ? "موفق" : "ناموفق"} در ${human(last.durationSec, true)}${last.skippedBuild ? " (بدون بیلد مجدد)" : ` — بیلد ${human(last.buildSec, true)}`}`
						: `Last update: ${formatDate(last.at, locale, true)} — ${last.ok ? "success" : "failed"} in ${human(last.durationSec, false)}${last.skippedBuild ? " (no rebuild)" : ` — build ${human(last.buildSec, false)}`}`
					: fa
						? "هنوز بروزرسانی‌ای از داخل پنل اجرا نشده است."
						: "No in-panel update has run yet."}
			</p>
		</Card>
	)
}
