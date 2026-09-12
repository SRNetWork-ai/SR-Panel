"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Activity, Check, KeyRound, Plug, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react"
import { api } from "@/lib/client"
import type { AdminDto } from "@/lib/dto"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Field, Input, Progress, cx, useToast } from "@/components/ui"
import { Row, Section } from "@/components/parts"
import { QR } from "@/components/QR"
import { CopyBtn } from "./atoms"
import { errMsg, tr } from "./types"

export function SecurityTab({ me, totpOn, onTotp }: { me: AdminDto; totpOn: boolean; onTotp: (on: boolean) => void }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const router = useRouter()
	const isOwner = me.role === "OWNER"
	const [setup, setSetup] = useState<{ secret: string; url: string } | null>(null)
	const [code, setCode] = useState("")
	const [busy, setBusy] = useState(false)
	const [secure, setSecure] = useState(true)
	const [agent, setAgent] = useState("")

	useEffect(() => {
		setSecure(window.isSecureContext)
		const ua = navigator.userAgent
		setAgent(ua.length > 60 ? `${ua.slice(0, 60)}…` : ua)
	}, [])

	const fail = (err: unknown) => toast.err(errMsg(err, L("عملیات انجام نشد", "Request failed")))

	const begin2fa = async () => {
		setBusy(true)
		try {
			setSetup(await api<{ secret: string; url: string }>("/api/auth/totp", { method: "POST", json: { action: "begin" } }))
		} catch (err) {
			fail(err)
		} finally {
			setBusy(false)
		}
	}

	const confirm2fa = async () => {
		setBusy(true)
		try {
			await api("/api/auth/totp", { method: "POST", json: { action: "confirm", code } })
			onTotp(true)
			setSetup(null)
			setCode("")
			toast.ok(t("set_2fa_enabled"))
			router.refresh()
		} catch (err) {
			fail(err)
		} finally {
			setBusy(false)
		}
	}

	const disable2fa = async () => {
		setBusy(true)
		try {
			await api("/api/auth/totp", { method: "POST", json: { action: "disable", code } })
			onTotp(false)
			setCode("")
			toast.ok(t("set_2fa_disabled"))
			router.refresh()
		} catch (err) {
			fail(err)
		} finally {
			setBusy(false)
		}
	}

	const posture = [
		{ id: "totp", label: L("ورود دو مرحله‌ای روشن است", "Two-factor is on"), ok: totpOn },
		{ id: "active", label: L("حساب فعال است", "Account is active"), ok: me.isActive },
		{ id: "tg", label: L("شناسه تلگرام برای هشدارها ثبت شده", "Telegram id set for alerts"), ok: Boolean(me.telegramId) },
		{ id: "https", label: L("اتصال این مرورگر امن است", "This browser session is secure"), ok: secure },
	]
	const done = posture.filter((p) => p.ok).length
	const pct = Math.round((done / posture.length) * 100)
	const tone = pct === 100 ? "success" : pct >= 50 ? "warning" : "danger"

	return (
		<div className="grid gap-4 xl:grid-cols-2">
			<Section icon={ShieldCheck} title={t("set_2fa")} subtitle={t("set_2fa_hint")} actions={<Badge tone={totpOn ? "success" : "warning"}>{totpOn ? L("فعال", "On") : L("خاموش", "Off")}</Badge>}>
				{!totpOn && !setup && (
					<div className="space-y-3">
						<p className="text-sm text-muted">{L("پس از فعال‌سازی، هنگام ورود یک کد ۶ رقمی از اپلیکیشن احراز هویت (Google Authenticator، Authy، 1Password) پرسیده می‌شود.", "Once enabled, sign-in asks for a 6-digit code from your authenticator app (Google Authenticator, Authy, 1Password).")}</p>
						<Button variant="primary" loading={busy} onClick={begin2fa}>
							{t("set_2fa_start")}
						</Button>
					</div>
				)}
				{setup && (
					<div className="space-y-3">
						<p className="text-sm text-muted">{t("set_2fa_scan")}</p>
						<div className="flex flex-wrap items-start gap-4">
							<QR value={setup.url} size={164} />
							<div className="min-w-0 flex-1 space-y-2">
								<div className="text-[11px] text-muted">{L("کلید دستی", "Manual key")}</div>
								<div className="flex items-center gap-2">
									<code className="glass-2 mono block min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-xs">{setup.secret}</code>
									<CopyBtn value={setup.secret} label={L("کپی کلید", "Copy key")} />
								</div>
								<Field label={t("set_2fa_confirm")}>
									<Input inputMode="numeric" maxLength={6} className="mono tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
								</Field>
								<div className="flex flex-wrap gap-2">
									<Button variant="primary" loading={busy} disabled={code.length !== 6} onClick={confirm2fa}>
										{t("set_2fa_enable")}
									</Button>
									<Button
										variant="ghost"
										onClick={() => {
											setSetup(null)
											setCode("")
										}}
									>
										{t("cancel")}
									</Button>
								</div>
								<p className="text-[11px] text-muted">{L("کلید دستی را جای امنی نگه دارید؛ اگر گوشی را گم کنید همین کلید راه بازگشت است.", "Keep the manual key somewhere safe; it is your way back if you lose the phone.")}</p>
							</div>
						</div>
					</div>
				)}
				{totpOn && (
					<div className="space-y-3">
						<div className="flex items-center gap-2 text-sm text-success">
							<Check className="h-4 w-4" />
							{t("set_2fa_enabled_msg")}
						</div>
						<Field label={t("set_2fa_confirm")} hint={L("برای خاموش کردن، کد فعلی اپ را وارد کنید.", "Enter the current app code to turn it off.")}>
							<Input inputMode="numeric" maxLength={6} className="mono tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
						</Field>
						<Button variant="danger" loading={busy} disabled={code.length !== 6} onClick={disable2fa}>
							{t("set_2fa_disable")}
						</Button>
					</div>
				)}
			</Section>

			<div className="space-y-4">
				<Section icon={pct === 100 ? ShieldCheck : ShieldAlert} title={L("وضعیت امنیت", "Security posture")} subtitle={L("چند مورد ساده که الان قابل بررسی است", "A few checks we can verify right now")} actions={<Badge tone={tone}>{`${pct}%`}</Badge>}>
					<Progress value={pct} />
					<ul className="mt-3 space-y-2 text-sm">
						{posture.map((p) => (
							<li key={p.id} className="flex items-center gap-2">
								{p.ok ? <Check className="h-4 w-4 shrink-0 text-success" /> : <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />}
								<span className={cx("min-w-0", p.ok ? "text-fg" : "text-muted")}>{p.label}</span>
							</li>
						))}
					</ul>
					<div className="mt-3 space-y-0">
						<Row label={L("حساب فعلی", "Signed in as")} mono>{me.username}</Row>
						<Row
							label={
								<span className="flex items-center gap-1">
									<Smartphone className="h-3.5 w-3.5" />
									{L("دستگاه این نشست", "This device")}
								</span>
							}
							mono
						>
							{agent || "—"}
						</Row>
					</div>
				</Section>

				<Section icon={KeyRound} title={L("توصیه‌های امنیتی", "Security checklist")} subtitle={L("چند عادت که پنل را ایمن نگه می‌دارد", "A few habits that keep your panel safe")}>
					<ul className="space-y-2 text-sm">
						{[
							L("رمز عبور یکتا و طولانی بگذارید و جای دیگر از آن استفاده نکنید.", "Use a long, unique password and never reuse it."),
							L("ورود دو مرحله‌ای را روشن نگه دارید.", "Keep two-factor authentication switched on."),
							L("برای هر ادمین حساب جداگانه بسازید؛ حساب مالک را به اشتراک نگذارید.", "Give each admin their own account; never share the owner login."),
							L("بکاپ زمان‌بندی‌شده را فعال کنید تا نسخه پشتیبان به تلگرام برسد.", "Enable scheduled backups so copies land in Telegram."),
							L("کلیدهای API بی‌استفاده را حذف کنید و دسترسی هر کلید را محدود بگیرید.", "Delete unused API keys and keep each key's scope narrow."),
							L("گزارش فعالیت را هفتگی مرور کنید تا ورود یا تغییر مشکوک را زود ببینید.", "Skim the activity log weekly to spot odd logins or changes early."),
						].map((line) => (
							<li key={line} className="flex gap-2">
								<Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-soft" />
								<span className="text-muted">{line}</span>
							</li>
						))}
					</ul>
					<div className="mt-4 flex flex-wrap gap-2">
						<Link href="/integrations" className="btn btn-sm">
							<Plug className="h-4 w-4" />
							{L("کلیدهای API", "API keys")}
						</Link>
						{isOwner && (
							<Link href="/audit" className="btn btn-sm">
								<Activity className="h-4 w-4" />
								{L("گزارش فعالیت", "Activity log")}
							</Link>
						)}
					</div>
				</Section>
			</div>
		</div>
	)
}
