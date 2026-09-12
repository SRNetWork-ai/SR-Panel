"use client"

import { useEffect, useState } from "react"
import { Clock, LogOut } from "lucide-react"
import { api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Field, Input, cx, useToast } from "@/components/ui"
import { errMsg, tr, type Tone } from "./types"

const PRESETS = [5, 10, 15, 30, 60, 120]

type Cfg = { idleMinutes: number; min: number; max: number }

function InfoRow({ label, value, tone = "muted" }: { label: string; value: string; tone?: Tone }) {
	return (
		<div className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
			<span className="text-xs text-muted">{label}</span>
			<Badge tone={tone}>{value}</Badge>
		</div>
	)
}

/** Session & AFK behaviour - the idle window is stored per browser (cookie). */
export function SessionTab() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [cfg, setCfg] = useState<Cfg>({ idleMinutes: 15, min: 2, max: 720 })
	const [minutes, setMinutes] = useState(15)
	const [busy, setBusy] = useState(false)
	const [lastActive, setLastActive] = useState<number | null>(null)
	const [now, setNow] = useState(() => Date.now())
	const [device, setDevice] = useState("—")

	useEffect(() => {
		let alive = true
		api<Cfg>("/api/auth/session")
			.then((r) => {
				if (!alive) return
				setCfg(r)
				setMinutes(r.idleMinutes)
			})
			.catch(() => undefined)
		const ua = navigator.userAgent
		setDevice(ua.length > 68 ? `${ua.slice(0, 68)}…` : ua)
		return () => {
			alive = false
		}
	}, [])

	useEffect(() => {
		const tick = () => {
			const raw = Number(localStorage.getItem("srp:last-active") ?? 0)
			setLastActive(raw > 0 ? raw : null)
			setNow(Date.now())
		}
		tick()
		const h = setInterval(tick, 5000)
		return () => clearInterval(h)
	}, [])

	const save = async () => {
		const value = Math.max(cfg.min, Math.min(cfg.max, Math.round(Number(minutes) || cfg.idleMinutes)))
		setBusy(true)
		try {
			const r = await api<{ idleMinutes: number }>("/api/auth/session", { method: "PUT", json: { minutes: value } })
			setCfg((c) => ({ ...c, idleMinutes: r.idleMinutes }))
			setMinutes(r.idleMinutes)
			toast.ok(t("set_saved"))
			window.setTimeout(() => location.reload(), 600)
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setBusy(false)
		}
	}

	const logout = async () => {
		try {
			await api("/api/auth/logout", { method: "POST" })
		} catch {
			/* the cookie is dropped by the redirect anyway */
		}
		location.replace("/login?reason=out")
	}

	const leftSec = lastActive === null ? null : Math.max(0, Math.round((lastActive + cfg.idleMinutes * 60_000 - now) / 1000))
	const leftLabel = leftSec === null ? "—" : leftSec >= 60 ? L(`حدود ${Math.ceil(leftSec / 60)} دقیقه`, `~${Math.ceil(leftSec / 60)} min`) : L(`${leftSec} ثانیه`, `${leftSec}s`)
	const leftTone: Tone = leftSec === null ? "muted" : leftSec > 120 ? "success" : leftSec > 30 ? "warning" : "danger"
	const dirty = Number(minutes) !== cfg.idleMinutes

	return (
		<div className="space-y-4">
			<Card
				title={L("قفل خودکار در بی‌کاری (AFK)", "Idle auto-lock (AFK)")}
				subtitle={L("اگر تا این مدت هیچ فعالیتی در پنل نباشد، نشست بسته می‌شود و باید دوباره یوزر و پسورد بزنید.", "With no activity for this long the session is closed and a fresh username/password login is required.")}
			>
				<div className="space-y-3">
					<div className="flex flex-wrap gap-1.5">
						{PRESETS.map((m) => (
							<button key={m} type="button" className={cx("chip", Number(minutes) === m && "chip-on")} onClick={() => setMinutes(m)}>
								{m} {L("دقیقه", "min")}
							</button>
						))}
					</div>
					<div className="grid gap-3 sm:grid-cols-[10rem_auto] sm:items-end">
						<Field label={L("مقدار دلخواه (دقیقه)", "Custom (minutes)")} hint={L(`بین ${cfg.min} تا ${cfg.max}`, `${cfg.min} to ${cfg.max}`)}>
							<Input type="number" min={cfg.min} max={cfg.max} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
						</Field>
						<Button variant="primary" type="button" loading={busy} disabled={!dirty} onClick={save}>
							<Clock className="h-4 w-4" />
							{t("save")}
						</Button>
					</div>
					<p className="text-[11px] text-muted">{L("این تنطیم برای همین مرورگر ذخیره می‌شود؛ ۶۰ ثانیه قبل از خروج هشدار نمایش داده می‌شود.", "Saved for this browser only; a warning shows 60 seconds before the session closes.")}</p>
				</div>
			</Card>

			<Card title={L("وضعیت نشست", "Session state")}>
				<div>
					<InfoRow label={L("قفل خودکار پس از", "Idle window")} value={L(`${cfg.idleMinutes} دقیقه`, `${cfg.idleMinutes} min`)} tone="success" />
					<InfoRow label={L("زمان باقی‌مانده تا قفل", "Time left")} value={leftLabel} tone={leftTone} />
					<InfoRow label={L("ورود مجدد پس از بستن مرورگر", "Re-login after closing the browser")} value={L("فعال", "Enabled")} tone="success" />
					<InfoRow label={L("مرورگر این نشست", "This browser")} value={device} />
				</div>
			</Card>

			<Card title={L("خروج از حساب", "Sign out")} subtitle={L("کوکی نشست بدون تاریخ انقضا ذخیره می‌شود، پس بستن کامل مرورگر هم نشست را از بین می‌برد.", "The session cookie has no expiry date, so fully closing the browser also ends the session.")}>
				<Button variant="danger" type="button" onClick={logout}>
					<LogOut className="h-4 w-4" />
					{L("خروج از این مرورگر", "Log out of this browser")}
				</Button>
			</Card>
		</div>
	)
}
