"use client"

import { useState, type FormEvent } from "react"
import { Check, Circle, Clock3, Dices, Eye, EyeOff, KeyRound, ShieldCheck, UserCircle2, Users2 } from "lucide-react"
import { api, copyText } from "@/lib/client"
import type { AdminDto } from "@/lib/dto"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Field, Input, Progress, cx, useToast } from "@/components/ui"
import { MiniStat } from "@/components/bits"
import { Row, Section } from "@/components/parts"
import { CopyBtn, Gradient } from "./atoms"
import { errMsg, fmtWhen, makePassword, scorePassword, tr, type Brand } from "./types"

export function AccountTab({ me, brand, totpOn }: { me: AdminDto; brand: Brand; totpOn: boolean }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const isOwner = me.role === "OWNER"
	const [pw, setPw] = useState({ current: "", next: "", confirm: "" })
	const [show, setShow] = useState(false)
	const [busy, setBusy] = useState(false)
	const strength = scorePassword(pw.next, locale)
	const mismatch = pw.confirm.length > 0 && pw.next !== pw.confirm

	const changePassword = async (e: FormEvent) => {
		e.preventDefault()
		if (pw.next !== pw.confirm) {
			toast.err(t("set_pw_mismatch"))
			return
		}
		if (pw.next.length < 8) {
			toast.err(L("رمز عبور باید حداقل ۸ کاراکتر باشد", "Password must be at least 8 characters"))
			return
		}
		setBusy(true)
		try {
			await api("/api/auth/password", { method: "POST", json: { current: pw.current, next: pw.next } })
			setPw({ current: "", next: "", confirm: "" })
			setShow(false)
			toast.ok(t("set_pw_changed"))
		} catch (err) {
			toast.err(errMsg(err, L("تغییر رمز انجام نشد", "Could not change password")))
		} finally {
			setBusy(false)
		}
	}

	const suggest = async () => {
		const next = makePassword(18)
		setPw((p) => ({ ...p, next, confirm: next }))
		setShow(true)
		await copyText(next)
		toast.ok(L("رمز پیشنهادی ساخته و کپی شد", "Strong password generated and copied"))
	}

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<MiniStat icon={<UserCircle2 className="h-4 w-4" />} label={L("نقش", "Role")} value={isOwner ? t("owner") : t("admin")} tone="violet" />
				<MiniStat icon={<ShieldCheck className="h-4 w-4" />} label={L("ورود دو مرحله‌ای", "Two-factor")} value={totpOn ? L("فعال", "On") : L("خاموش", "Off")} tone={totpOn ? "success" : "warning"} />
				<MiniStat icon={<Users2 className="h-4 w-4" />} label={L("سقف کلاینت", "Client limit")} value={me.clientLimit === null ? t("unlimited") : me.clientLimit} tone="cyan" />
				<MiniStat icon={<Clock3 className="h-4 w-4" />} label={L("آخرین ورود", "Last login")} value={fmtWhen(me.lastLoginAt, locale)} />
			</div>

			<div className="grid gap-4 xl:grid-cols-2">
				<Section icon={UserCircle2} title={t("set_account")} subtitle={L("اطلاعات حساب و دسترسی شما", "Your account and access details")} actions={<CopyBtn value={me.username} label={L("کپی نام کاربری", "Copy username")} />}>
					<div className="mb-3 flex items-center gap-3">
						<Gradient from={brand.primaryColor} to={brand.accentColor} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-lg">
							{(me.displayName || me.username).slice(0, 1).toUpperCase()}
						</Gradient>
						<div className="min-w-0">
							<div className="truncate text-base font-semibold">{me.displayName || me.username}</div>
							<div className="mono truncate text-xs text-muted">{"@" + me.username}</div>
						</div>
					</div>
					<Row label={L("نقش", "Role")}>
						<Badge tone={isOwner ? "violet" : "cyan"}>{isOwner ? t("owner") : t("admin")}</Badge>
					</Row>
					<Row label={L("وضعیت حساب", "Account status")}>
						<Badge tone={me.isActive ? "success" : "danger"}>{me.isActive ? t("active") : t("inactive")}</Badge>
					</Row>
					<Row label={L("ورود دو مرحله‌ای", "Two-factor")}>
						<Badge tone={totpOn ? "success" : "warning"}>{totpOn ? L("فعال", "On") : L("خاموش", "Off")}</Badge>
					</Row>
					<Row label={L("شناسه تلگرام", "Telegram id")} mono>{me.telegramId || "—"}</Row>
					<Row label={L("سقف کلاینت", "Client limit")} mono>{me.clientLimit === null ? t("unlimited") : me.clientLimit}</Row>
					<Row label={L("آخرین ورود", "Last login")} mono>{fmtWhen(me.lastLoginAt, locale)}</Row>
					<Row label={t("created_at")} mono>{fmtWhen(me.createdAt, locale)}</Row>
				</Section>

				<Section
					icon={KeyRound}
					title={t("set_password")}
					subtitle={L("رمز عبور ورود به پنل را عوض کنید", "Change your panel sign-in password")}
					actions={
						<Button type="button" size="sm" variant="ghost" onClick={() => setShow((s) => !s)}>
							{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
							{show ? L("پنهان کردن", "Hide") : L("نمایش", "Show")}
						</Button>
					}
				>
					<form className="space-y-3" onSubmit={changePassword}>
						<Field label={t("set_pw_current")}>
							<Input type={show ? "text" : "password"} autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
						</Field>
						<div className="grid gap-3 sm:grid-cols-2">
							<Field label={t("set_pw_new")}>
								<Input type={show ? "text" : "password"} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
							</Field>
							<Field label={t("set_pw_confirm")} hint={mismatch ? t("set_pw_mismatch") : undefined}>
								<Input type={show ? "text" : "password"} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
							</Field>
						</div>

						{pw.next ? (
							<div className="glass-2 space-y-2 p-3">
								<div className="flex items-center justify-between gap-2">
									<span className="text-[11px] text-muted">{L("قدرت رمز", "Password strength")}</span>
									<Badge tone={strength.tone}>{strength.label}</Badge>
								</div>
								<Progress value={(strength.score / 5) * 100} />
								<ul className="grid gap-1 sm:grid-cols-2">
									{strength.checks.map((c) => (
										<li key={c.id} className={cx("flex items-center gap-1.5 text-[11px]", c.ok ? "text-success" : "text-muted")}>
											{c.ok ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
											{c.label}
										</li>
									))}
								</ul>
							</div>
						) : null}

						<div className="flex flex-wrap items-center justify-between gap-3">
							<Button type="button" size="sm" variant="ghost" onClick={suggest}>
								<Dices className="h-4 w-4" />
								{L("ساخت رمز قوی", "Generate strong password")}
							</Button>
							<Button type="submit" variant="primary" loading={busy} disabled={mismatch}>
								{t("set_change_pass")}
							</Button>
						</div>
						<p className="text-[11px] text-muted">{L("حداقل ۸ کاراکتر؛ ترکیب حرف، عدد و علامت توصیه می‌شود. پس از تغییر رمز، نشست‌های دیگر ممکن است نیاز به ورود دوباره داشته باشند.", "At least 8 characters; mix letters, numbers and symbols. Other sessions may need to sign in again.")}</p>
					</form>
				</Section>
			</div>
		</div>
	)
}
