"use client"

import { useCallback, useEffect, useState } from "react"
import { KeyRound, Lock, RefreshCw, Save, ShieldAlert, Users } from "lucide-react"
import type { SecuritySettings } from "@srpanel/core"
import { api } from "@/lib/client"
import { useLocale } from "@/lib/i18n"
import { Button, Field, Input, Spinner, Switch, useToast } from "@/components/ui"
import { MiniStat } from "@/components/bits"
import { Section } from "@/components/parts"
import { errMsg, fmtWhen, tr } from "./types"

type Snapshot = { failures24h: number; locks24h: number; lastFailureAt: string | null; lastLockAt: string | null; activeSessions: number }
type Payload = { settings: SecuritySettings; snapshot: Snapshot }

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(v || 0)))

/** Owner-only brute-force policy for the login page (Setting-backed, no schema change). */
export function LoginGuardCard() {
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [form, setForm] = useState<SecuritySettings | null>(null)
	const [snap, setSnap] = useState<Snapshot | null>(null)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)

	const load = useCallback(async () => {
		setLoading(true)
		try {
			const r = await api<Payload>("/api/settings/security")
			setForm(r.settings)
			setSnap(r.snapshot)
		} catch {
			setForm(null)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		void load()
	}, [load])

	async function save() {
		if (!form) return
		setSaving(true)
		try {
			const r = await api<Payload>("/api/settings/security", { method: "PUT", json: form })
			setForm(r.settings)
			setSnap(r.snapshot)
			toast.ok(L("سیاست امنیتی ذخیره شد", "Security policy saved"))
		} catch (err) {
			toast.err(errMsg(err, L("خطا در ذخیره", "Save failed")))
		} finally {
			setSaving(false)
		}
	}

	if (loading && !form) {
		return (
			<Section icon={ShieldAlert} title={L("محافظت از ورود", "Login protection")}>
				<div className="flex justify-center py-6">
					<Spinner />
				</div>
			</Section>
		)
	}

	return (
		<Section
			icon={ShieldAlert}
			title={L("محافظت از ورود", "Login protection")}
			subtitle={L("قفل موقت پس از تلاش‌های ناموفق متوالی؛ بدون تغییر در دیتابیس", "Temporary lockout after repeated failures — no database change")}
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
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<MiniStat icon={<KeyRound className="h-4 w-4" />} label={L("ورود ناموفق ۲۴ ساعت", "Failed logins 24h")} value={snap ? String(snap.failures24h) : "—"} tone={snap && snap.failures24h > 0 ? "warning" : "success"} />
						<MiniStat icon={<Lock className="h-4 w-4" />} label={L("قفل ۲۴ ساعت", "Lockouts 24h")} value={snap ? String(snap.locks24h) : "—"} tone={snap && snap.locks24h > 0 ? "danger" : "success"} />
						<MiniStat icon={<Users className="h-4 w-4" />} label={L("نشست فعال", "Active sessions")} value={snap ? String(snap.activeSessions) : "—"} tone="violet" />
						<MiniStat icon={<ShieldAlert className="h-4 w-4" />} label={L("آخرین تلاش ناموفق", "Last failed try")} value={fmtWhen(snap ? snap.lastFailureAt : null, locale)} tone="cyan" />
					</div>

					<div className="grid gap-2 sm:grid-cols-2">
						<Switch checked={form.lockEnabled} onChange={(v) => setForm({ ...form, lockEnabled: v })} label={L("قفل خودکار پس از تلاش‌های ناموفق", "Auto-lock after failed attempts")} />
						<Switch checked={form.perIp} onChange={(v) => setForm({ ...form, perIp: v })} label={L("قفل بر اساس IP هم اعمال شود", "Lock by source IP as well")} />
						<Switch checked={form.notifyLock} onChange={(v) => setForm({ ...form, notifyLock: v })} label={L("اعلان تلگرام هنگام قفل شدن", "Telegram alert when a lock starts")} />
						<Switch
							checked={form.revokeOnPasswordChange}
							onChange={(v) => setForm({ ...form, revokeOnPasswordChange: v })}
							label={L("خروج مرورگرهای دیگر پس از تغییر رمز", "Sign other browsers out on password change")}
						/>
					</div>

					<div className="grid gap-3 sm:grid-cols-3">
						<Field label={L("تعداد تلاش ناموفق", "Failed attempts")} hint={L("بین ۳ تا ۵۰ بار", "Between 3 and 50")}>
							<Input type="number" min={3} max={50} disabled={!form.lockEnabled} value={String(form.maxFailures)} onChange={(e) => setForm({ ...form, maxFailures: clamp(Number(e.target.value), 3, 50) })} />
						</Field>
						<Field label={L("بازه شمارش (دقیقه)", "Counting window (min)")} hint={L("تلاش‌های قدیمی‌تر نادیده می‌شوند", "Older attempts are ignored")}>
							<Input type="number" min={1} max={1440} disabled={!form.lockEnabled} value={String(form.windowMin)} onChange={(e) => setForm({ ...form, windowMin: clamp(Number(e.target.value), 1, 1440) })} />
						</Field>
						<Field label={L("مدت قفل (دقیقه)", "Lock duration (min)")} hint={L("از آخرین تلاش ناموفق", "Counted from the last failure")}>
							<Input type="number" min={1} max={1440} disabled={!form.lockEnabled} value={String(form.lockMin)} onChange={(e) => setForm({ ...form, lockMin: clamp(Number(e.target.value), 1, 1440) })} />
						</Field>
					</div>

					<ul className="space-y-1 text-[11px] text-muted">
						<li>{L("شمارش از همان لاگ ورود ناموفق انجام می‌شود و با هر ورود موفق صفر می‌شود.", "Counting uses the existing failed-login log and resets on every successful sign-in.")}</li>
						<li>{L("پاکسازی لاگ‌ها یا ورود موفق قفل را فوری برمی‌دارد.", "Pruning the logs or one successful sign-in clears an active lock.")}</li>
						<li>{L(`آخرین قفل: ${fmtWhen(snap ? snap.lastLockAt : null, locale)}`, `Last lockout: ${fmtWhen(snap ? snap.lastLockAt : null, locale)}`)}</li>
					</ul>
				</div>
			) : (
				<p className="text-xs text-danger">{L("خواندن سیاست امنیتی ممکن نشد.", "Could not load the security policy.")}</p>
			)}
		</Section>
	)
}
