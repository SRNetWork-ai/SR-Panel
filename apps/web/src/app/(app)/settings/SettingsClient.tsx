"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Activity, ArrowDownToLine, Check, Clock, Copy, DatabaseBackup, ExternalLink, Globe2, KeyRound, Moon, Palette, Plug, Server, Settings2, ShieldCheck, Sparkles, Store, Sun, UserCircle2, Zap } from "lucide-react"
import { ApiError, api, copyText } from "@/lib/client"
import type { AdminDto } from "@/lib/dto"
import { useLocale, useT } from "@/lib/i18n"
import { QR } from "@/components/QR"
import { Badge, Button, Field, Input, PageHeader, Switch, cx, useToast } from "@/components/ui"
import { Row, Section, Tabs, type TabItem } from "@/components/parts"

type Brand = { name: string; tagline: string; logoUrl: string; primaryColor: string; accentColor: string; supportUrl: string; telegramUrl: string }
export type SystemInfo = { version: string; publicUrl: string; tz: string; agentHint: boolean }
type Tab = "account" | "security" | "brand" | "appearance" | "system"

const YEAR = 60 * 60 * 24 * 365

function cookie(name: string, value: string) {
	document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`
}

/** Inline gradients would need a style object; set them on the node instead. */
function Gradient({ from, to, className, children }: { from: string; to: string; className?: string; children?: ReactNode }) {
	const ref = useRef<HTMLDivElement | null>(null)
	useEffect(() => {
		ref.current?.style.setProperty("background", `linear-gradient(135deg, ${from}, ${to})`)
	}, [from, to])
	return (
		<div ref={ref} className={className}>
			{children}
		</div>
	)
}

function CopyBtn({ value, label }: { value: string; label: string }) {
	const [done, setDone] = useState(false)
	return (
		<Button
			size="icon"
			variant="ghost"
			title={label}
			onClick={async () => {
				await copyText(value)
				setDone(true)
				window.setTimeout(() => setDone(false), 1200)
			}}
		>
			{done ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
		</Button>
	)
}

function Choice({ active, onClick, icon: Icon, title, hint }: { active: boolean; onClick: () => void; icon: typeof Sun; title: string; hint?: string }) {
	return (
		<button type="button" onClick={onClick} className={cx("glass flex flex-1 items-center gap-3 p-3 text-start transition hover:-translate-y-0.5", active ? "border border-violet/50 text-fg neon-ring" : "text-muted")}>
			<span className={cx("flex h-9 w-9 items-center justify-center rounded-xl", active ? "bg-gradient-to-br from-violet to-cyan text-white" : "bg-surface-2")}>
				<Icon className="h-4 w-4" />
			</span>
			<span className="min-w-0">
				<span className="block truncate text-sm font-medium">{title}</span>
				{hint ? <span className="block truncate text-[11px] text-muted">{hint}</span> : null}
			</span>
		</button>
	)
}

export function SettingsClient({ me, brand: initialBrand, info }: { me: AdminDto; brand: Brand; info: SystemInfo }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const toast = useToast()
	const router = useRouter()
	const isOwner = me.role === "OWNER"
	const [tab, setTab] = useState<Tab>("account")
	const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale === "fa" ? "fa-IR" : "en-US") : "—")

	/* ---------- password ---------- */
	const [pw, setPw] = useState({ current: "", next: "", confirm: "" })
	const [pwBusy, setPwBusy] = useState(false)
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
		setPwBusy(true)
		try {
			await api("/api/auth/password", { method: "POST", json: { current: pw.current, next: pw.next } })
			setPw({ current: "", next: "", confirm: "" })
			toast.ok(t("set_pw_changed"))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : L("تغییر رمز انجام نشد", "Could not change password"))
		} finally {
			setPwBusy(false)
		}
	}

	/* ---------- two-factor ---------- */
	const [totpOn, setTotpOn] = useState(me.totpEnabled)
	const [setup, setSetup] = useState<{ secret: string; url: string } | null>(null)
	const [code, setCode] = useState("")
	const [totpBusy, setTotpBusy] = useState(false)
	const fail = (err: unknown) => toast.err(err instanceof ApiError ? err.message : L("عملیات انجام نشد", "Request failed"))
	const begin2fa = async () => {
		setTotpBusy(true)
		try {
			setSetup(await api<{ secret: string; url: string }>("/api/auth/totp", { method: "POST", json: { action: "begin" } }))
		} catch (err) {
			fail(err)
		} finally {
			setTotpBusy(false)
		}
	}
	const confirm2fa = async () => {
		setTotpBusy(true)
		try {
			await api("/api/auth/totp", { method: "POST", json: { action: "confirm", code } })
			setTotpOn(true)
			setSetup(null)
			setCode("")
			toast.ok(t("set_2fa_enabled"))
			router.refresh()
		} catch (err) {
			fail(err)
		} finally {
			setTotpBusy(false)
		}
	}
	const disable2fa = async () => {
		setTotpBusy(true)
		try {
			await api("/api/auth/totp", { method: "POST", json: { action: "disable", code } })
			setTotpOn(false)
			setCode("")
			toast.ok(t("set_2fa_disabled"))
			router.refresh()
		} catch (err) {
			fail(err)
		} finally {
			setTotpBusy(false)
		}
	}

	/* ---------- brand ---------- */
	const [brand, setBrand] = useState<Brand>(initialBrand)
	const [brandBusy, setBrandBusy] = useState(false)
	const saveBrand = async (e: FormEvent) => {
		e.preventDefault()
		setBrandBusy(true)
		try {
			await api("/api/settings/brand", {
				method: "PUT",
				json: {
					name: brand.name,
					tagline: brand.tagline || null,
					logoUrl: brand.logoUrl || null,
					primaryColor: brand.primaryColor,
					accentColor: brand.accentColor,
					supportUrl: brand.supportUrl || null,
					telegramUrl: brand.telegramUrl || null,
				},
			})
			toast.ok(t("set_saved"))
			router.refresh()
		} catch (err) {
			fail(err)
		} finally {
			setBrandBusy(false)
		}
	}

	/* ---------- appearance ---------- */
	const [mode, setMode] = useState<"dark" | "light">("dark")
	const [compact, setCompact] = useState(false)
	const [calm, setCalm] = useState(false)
	const [now, setNow] = useState("")
	useEffect(() => {
		const root = document.documentElement
		setMode(root.classList.contains("light") ? "light" : "dark")
		setCompact(root.classList.contains("srp-compact"))
		setCalm(root.classList.contains("srp-calm"))
	}, [])
	useEffect(() => {
		const tick = () => setNow(new Date().toLocaleTimeString(locale === "fa" ? "fa-IR" : "en-US"))
		tick()
		const id = window.setInterval(tick, 1000)
		return () => window.clearInterval(id)
	}, [locale])
	const applyTheme = (next: "dark" | "light") => {
		setMode(next)
		document.documentElement.classList.toggle("light", next === "light")
		cookie("srp_theme", next)
	}
	const applyLocale = (next: "fa" | "en") => {
		cookie("srp_lang", next)
		router.refresh()
	}
	const applyPref = (which: "compact" | "calm", on: boolean) => {
		const cls = which === "compact" ? "srp-compact" : "srp-calm"
		document.documentElement.classList.toggle(cls, on)
		cookie(which === "compact" ? "srp_compact" : "srp_calm", on ? "1" : "0")
		if (which === "compact") setCompact(on)
		else setCalm(on)
	}

	const tabs: Array<TabItem<Tab>> = [
		{ id: "account", label: t("set_account"), icon: UserCircle2 },
		{ id: "security", label: L("امنیت", "Security"), icon: ShieldCheck, badge: totpOn ? "2FA" : undefined },
		{ id: "brand", label: t("set_brand"), icon: Palette },
		{ id: "appearance", label: t("set_appearance"), icon: Sparkles },
		{ id: "system", label: L("سیستم", "System"), icon: Settings2 },
	]

	const links: Array<{ href: string; label: string; icon: typeof Store; owner?: boolean }> = [
		{ href: "/updates", label: L("به‌روزرسانی پنل", "Panel updates"), icon: ArrowDownToLine, owner: true },
		{ href: "/backups", label: L("بکاپ‌ها", "Backups"), icon: DatabaseBackup, owner: true },
		{ href: "/monitoring", label: L("مانیتورینگ", "Monitoring"), icon: Activity, owner: true },
		{ href: "/integrations", label: L("یکپارچه‌سازی‌ها", "Integrations"), icon: Plug },
		{ href: "/store", label: L("فروشگاه", "Store"), icon: Store },
		{ href: "/servers", label: L("سرورها", "Servers"), icon: Server },
	].filter((l) => !l.owner || isOwner)

	return (
		<div className="space-y-6 fade-up">
			<PageHeader
				title={t("set_title")}
				subtitle={L("حساب، امنیت، برندینگ، ظاهر و اطلاعات سیستم", "Account, security, branding, appearance and system info")}
				actions={
					<>
						<Badge tone={isOwner ? "violet" : "cyan"}>{isOwner ? L("مالک", "Owner") : L("ادمین", "Admin")}</Badge>
						<Badge tone={totpOn ? "success" : "warning"}>{totpOn ? L("دو مرحله‌ای فعال", "2FA on") : L("دو مرحله‌ای خاموش", "2FA off")}</Badge>
					</>
				}
			/>
			<Tabs items={tabs} value={tab} onChange={setTab} />

			{tab === "account" && (
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
							<Badge tone={isOwner ? "violet" : "cyan"}>{isOwner ? L("مالک", "Owner") : L("ادمین", "Admin")}</Badge>
						</Row>
						<Row label={L("وضعیت حساب", "Account status")}>
							<Badge tone={me.isActive ? "success" : "danger"}>{me.isActive ? L("فعال", "Active") : L("غیرفعال", "Disabled")}</Badge>
						</Row>
						<Row label={L("ورود دو مرحله‌ای", "Two-factor")}>
							<Badge tone={totpOn ? "success" : "warning"}>{totpOn ? L("فعال", "On") : L("خاموش", "Off")}</Badge>
						</Row>
						<Row label={L("شناسه تلگرام", "Telegram id")} mono>{me.telegramId || "—"}</Row>
						<Row label={L("سقف کلاینت", "Client limit")} mono>{me.clientLimit === null ? L("بدون محدودیت", "Unlimited") : me.clientLimit}</Row>
						<Row label={L("آخرین ورود", "Last login")} mono>{fmt(me.lastLoginAt)}</Row>
						<Row label={L("تاریخ ساخت", "Created")} mono>{fmt(me.createdAt)}</Row>
					</Section>
					<Section icon={KeyRound} title={t("set_password")} subtitle={L("رمز عبور ورود به پنل را عوض کنید", "Change your panel sign-in password")}>
						<form className="space-y-3" onSubmit={changePassword}>
							<Field label={t("set_pw_current")}>
								<Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
							</Field>
							<div className="grid gap-3 sm:grid-cols-2">
								<Field label={t("set_pw_new")}>
									<Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
								</Field>
								<Field label={t("set_pw_confirm")}>
									<Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
								</Field>
							</div>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<span className="text-[11px] text-muted">{L("حداقل ۸ کاراکتر؛ ترکیب حرف، عدد و علامت توصیه می‌شود.", "At least 8 characters; mix letters, numbers and symbols.")}</span>
								<Button type="submit" variant="primary" loading={pwBusy}>
									{t("set_change_pass")}
								</Button>
							</div>
						</form>
					</Section>
				</div>
			)}

			{tab === "security" && (
				<div className="grid gap-4 xl:grid-cols-2">
					<Section icon={ShieldCheck} title={t("set_2fa")} subtitle={t("set_2fa_hint")} actions={<Badge tone={totpOn ? "success" : "warning"}>{totpOn ? L("فعال", "On") : L("خاموش", "Off")}</Badge>}>
						{!totpOn && !setup && (
							<div className="space-y-3">
								<p className="text-sm text-muted">{L("پس از فعال‌سازی، هنگام ورود یک کد ۶ رقمی از اپلیکیشن احراز هویت (Google Authenticator، Authy، 1Password) پرسیده می‌شود.", "Once enabled, sign-in asks for a 6-digit code from your authenticator app (Google Authenticator, Authy, 1Password).")}</p>
								<Button variant="primary" loading={totpBusy} onClick={begin2fa}>
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
											<Button variant="primary" loading={totpBusy} disabled={code.length !== 6} onClick={confirm2fa}>
												{t("set_2fa_enable")}
											</Button>
											<Button
												variant="ghost"
												onClick={() => {
													setSetup(null)
													setCode("")
												}}
											>
												{L("انصراف", "Cancel")}
											</Button>
										</div>
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
								<Button variant="danger" loading={totpBusy} disabled={code.length !== 6} onClick={disable2fa}>
									{t("set_2fa_disable")}
								</Button>
							</div>
						)}
					</Section>
					<Section icon={KeyRound} title={L("توصیه‌های امنیتی", "Security checklist")} subtitle={L("چند عادت که پنل را ایمن نگه می‌دارد", "A few habits that keep your panel safe")}>
						<ul className="space-y-2 text-sm">
							{[
								L("رمز عبور یکتا و طولانی بگذارید و جای دیگر از آن استفاده نکنید.", "Use a long, unique password and never reuse it."),
								L("ورود دو مرحله‌ای را روشن نگه دارید.", "Keep two-factor authentication switched on."),
								L("برای هر ادمین حساب جداگانه بسازید؛ حساب مالک را به اشتراک نگذارید.", "Give each admin their own account; never share the owner login."),
								L("بکاپ زمان‌بندی‌شده را فعال کنید تا نسخه پشتیبان به تلگرام برسد.", "Enable scheduled backups so copies land in Telegram."),
								L("کلیدهای API بی‌استفاده را حذف کنید.", "Delete API keys you no longer use."),
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
			)}

			{tab === "brand" && (
				<div className="grid gap-4 xl:grid-cols-3">
					<Section className="xl:col-span-2" icon={Palette} title={t("set_brand")} subtitle={t("set_brand_hint")}>
						<form className="space-y-3" onSubmit={saveBrand}>
							<div className="grid gap-3 sm:grid-cols-2">
								<Field label={t("set_brand_name")}>
									<Input value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} required maxLength={64} />
								</Field>
								<Field label={t("set_brand_tagline")}>
									<Input value={brand.tagline} onChange={(e) => setBrand({ ...brand, tagline: e.target.value })} maxLength={140} />
								</Field>
								<Field label={t("set_brand_logo")} hint="https://...">
									<Input value={brand.logoUrl} onChange={(e) => setBrand({ ...brand, logoUrl: e.target.value })} />
								</Field>
								<Field label={t("set_brand_support")} hint="https://...">
									<Input value={brand.supportUrl} onChange={(e) => setBrand({ ...brand, supportUrl: e.target.value })} />
								</Field>
								<Field label={t("set_brand_telegram")} hint="https://t.me/...">
									<Input value={brand.telegramUrl} onChange={(e) => setBrand({ ...brand, telegramUrl: e.target.value })} />
								</Field>
								<div className="grid grid-cols-2 gap-3">
									<Field label={t("set_brand_primary")}>
										<Input type="color" className="h-10 p-1" value={brand.primaryColor} onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })} />
									</Field>
									<Field label={t("set_brand_accent")}>
										<Input type="color" className="h-10 p-1" value={brand.accentColor} onChange={(e) => setBrand({ ...brand, accentColor: e.target.value })} />
									</Field>
								</div>
							</div>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<span className="text-[11px] text-muted">{L("این برند روی صفحه اشتراک و فروشگاه مشتریان شما دیده می‌شود.", "This brand appears on your store and subscription pages.")}</span>
								<Button type="submit" variant="primary" loading={brandBusy}>
									{L("ذخیره", "Save")}
								</Button>
							</div>
						</form>
					</Section>
					<Section icon={Sparkles} title={L("پیش‌نمایش برند", "Brand preview")} subtitle={L("همان چیزی که مشتری می‌بیند", "What your customer sees")}>
						<Gradient from={brand.primaryColor} to={brand.accentColor} className="mb-3 flex h-24 items-center gap-3 rounded-2xl px-4 text-white shadow-lg">
							<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/25 text-lg font-bold">{(brand.name || "S").slice(0, 1).toUpperCase()}</div>
							<div className="min-w-0">
								<div className="truncate text-base font-bold">{brand.name}</div>
								<div className="truncate text-xs opacity-90">{brand.tagline || L("فروشگاه اشتراک شما", "Your subscription store")}</div>
							</div>
						</Gradient>
						<Row label={t("set_brand_primary")} mono>{brand.primaryColor}</Row>
						<Row label={t("set_brand_accent")} mono>{brand.accentColor}</Row>
						<Row label={L("پشتیبانی", "Support")} mono>{brand.supportUrl || "—"}</Row>
						<Row label={L("تلگرام", "Telegram")} mono>{brand.telegramUrl || "—"}</Row>
						<div className="mt-3 flex flex-wrap gap-2">
							<Link href="/store" className="btn btn-sm">
								<Store className="h-4 w-4" />
								{L("تنظیمات فروشگاه", "Store settings")}
							</Link>
						</div>
					</Section>
				</div>
			)}

			{tab === "appearance" && (
				<div className="grid gap-4 xl:grid-cols-2">
					<Section icon={Sparkles} title={t("set_appearance")} subtitle={L("تم، زبان و حالت نمایش پنل", "Theme, language and display mode")}>
						<div className="space-y-4">
							<div>
								<div className="mb-2 text-xs text-muted">{L("تم", "Theme")}</div>
								<div className="flex flex-wrap gap-2">
									<Choice active={mode === "dark"} onClick={() => applyTheme("dark")} icon={Moon} title={L("تیره لوکس", "Dark luxe")} hint={L("پیش‌فرض، با افکت نئون", "Default, neon accents")} />
									<Choice active={mode === "light"} onClick={() => applyTheme("light")} icon={Sun} title={L("روشن", "Light")} hint={L("مناسب محیط پرنور", "Better in bright rooms")} />
								</div>
							</div>
							<div>
								<div className="mb-2 text-xs text-muted">{L("زبان", "Language")}</div>
								<div className="flex flex-wrap gap-2">
									<Choice active={locale === "fa"} onClick={() => applyLocale("fa")} icon={Globe2} title="فارسی" hint="RTL" />
									<Choice active={locale === "en"} onClick={() => applyLocale("en")} icon={Globe2} title="English" hint="LTR" />
								</div>
							</div>
							<div className="space-y-3 border-t border-line pt-3">
								<div className="flex items-center justify-between gap-3">
									<div className="min-w-0">
										<div className="text-sm">{L("حالت جمع‌وجور", "Compact density")}</div>
										<div className="text-[11px] text-muted">{L("فونت و فاصله‌ها کمی کوچک‌تر می‌شوند", "Slightly smaller text and spacing")}</div>
									</div>
									<Switch checked={compact} onChange={(v) => applyPref("compact", v)} />
								</div>
								<div className="flex items-center justify-between gap-3">
									<div className="min-w-0">
										<div className="text-sm">{L("کاهش انیمیشن", "Reduced motion")}</div>
										<div className="text-[11px] text-muted">{L("افکت‌های سه‌بعدی و شناور خاموش می‌شوند", "Turns off 3D and floating effects")}</div>
									</div>
									<Switch checked={calm} onChange={(v) => applyPref("calm", v)} />
								</div>
							</div>
						</div>
					</Section>
					<Section icon={Zap} title={L("پیش‌نمایش ظاهر", "Appearance preview")} subtitle={L("تغییرات بی‌درنگ اعمال می‌شوند", "Changes apply instantly")}>
						<div className="space-y-3">
							<div className="glass-2 tilt flex items-center justify-between gap-3 p-3">
								<div className="text-sm">{L("کارت نمونه", "Sample card")}</div>
								<Badge tone="violet">{L("فعال", "Active")}</Badge>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button variant="primary" size="sm">
									{L("دکمه اصلی", "Primary")}
								</Button>
								<Button size="sm">{L("دکمه ساده", "Default")}</Button>
								<Button variant="ghost" size="sm">
									{L("شفاف", "Ghost")}
								</Button>
							</div>
							<Row label={L("تم فعال", "Active theme")}>{mode === "dark" ? L("تیره", "Dark") : L("روشن", "Light")}</Row>
							<Row label={L("زبان فعال", "Active language")}>{locale === "fa" ? "فارسی" : "English"}</Row>
							<Row label={L("ساعت مرورگر", "Browser clock")} mono>{now}</Row>
						</div>
					</Section>
				</div>
			)}

			{tab === "system" && (
				<div className="grid gap-4 xl:grid-cols-2">
					<Section icon={Server} title={L("اطلاعات پنل", "Panel info")} subtitle={L("نسخه و آدرس سرویس", "Version and service address")} actions={info.publicUrl ? <CopyBtn value={info.publicUrl} label={L("کپی آدرس", "Copy URL")} /> : undefined}>
						<Row label={L("نسخه پنل", "Panel version")} mono>{info.version}</Row>
						<Row label={L("آدرس عمومی", "Public URL")} mono>{info.publicUrl || "—"}</Row>
						<Row
							label={
								<span className="flex items-center gap-1">
									<Clock className="h-3.5 w-3.5" />
									{L("منطقه زمانی سرور", "Server timezone")}
								</span>
							}
							mono
						>
							{info.tz}
						</Row>
						<Row label={L("حساب فعلی", "Signed in as")} mono>{me.username}</Row>
						<Row label={L("آخرین ورود", "Last login")} mono>{fmt(me.lastLoginAt)}</Row>
						{info.publicUrl ? (
							<div className="mt-3">
								<a href={info.publicUrl} target="_blank" rel="noreferrer" className="btn btn-sm">
									<ExternalLink className="h-4 w-4" />
									{L("باز کردن آدرس عمومی", "Open public URL")}
								</a>
							</div>
						) : null}
					</Section>
					<Section icon={Settings2} title={L("میان‌برها", "Quick links")} subtitle={L("بخش‌هایی که از تنظیمات بیشتر سر می‌زنید", "Pages you reach for from settings")}>
						<div className="grid gap-2 sm:grid-cols-2">
							{links.map((l) => (
								<Link key={l.href} href={l.href} className="glass-2 flex items-center gap-3 p-3 text-sm transition hover:-translate-y-0.5">
									<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet/30 to-cyan/20 text-violet-soft">
										<l.icon className="h-4 w-4" />
									</span>
									<span className="min-w-0 truncate">{l.label}</span>
								</Link>
							))}
						</div>
						{info.agentHint ? <p className="mt-3 text-[11px] text-muted">{L("به‌روزرسانی پنل از صفحه به‌روزرسانی انجام می‌شود؛ نیازی به ورود به سرور نیست.", "Panel updates run from the Updates page; no server login needed.")}</p> : null}
					</Section>
				</div>
			)}
		</div>
	)
}
