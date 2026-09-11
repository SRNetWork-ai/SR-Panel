"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { Eye, EyeOff, Globe2, Info, KeyRound, LockKeyhole, Moon, Server, ShieldCheck, Sun, UserRound, Wallet, Zap } from "lucide-react"
import { Logo } from "@/components/Logo"
import { Button, Field, Input } from "@/components/ui"
import { ApiError, api } from "@/lib/client"
import { useLocale, useT, type DictKey } from "@/lib/i18n"

type LoginResponse = { ok: true; admin: { id: string; username: string; role: "OWNER" | "ADMIN" } } | { ok: false; reason: "invalid" | "disabled" | "totp_required" | "totp_invalid" }

const REASON_KEY: Record<string, DictKey> = {
	invalid: "login_invalid",
	disabled: "login_disabled",
	totp_invalid: "login_totp_invalid",
}

function setCookie(name: string, value: string) {
	document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
}

export default function LoginPage() {
	const t = useT()
	const locale = useLocale()
	const router = useRouter()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const [username, setUsername] = useState("")
	const [password, setPassword] = useState("")
	const [showPass, setShowPass] = useState(false)
	const [caps, setCaps] = useState(false)
	const [totp, setTotp] = useState("")
	const [needTotp, setNeedTotp] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [light, setLight] = useState(false)

	useEffect(() => {
		setLight(document.documentElement.classList.contains("light"))
	}, [])

	const switchLang = () => {
		setCookie("srp_lang", locale === "fa" ? "en" : "fa")
		router.refresh()
	}
	const switchTheme = () => {
		const next = !light
		setLight(next)
		document.documentElement.classList.toggle("light", next)
		setCookie("srp_theme", next ? "light" : "dark")
	}
	const trackCaps = (e: ReactKeyboardEvent<HTMLInputElement>) => {
		try {
			setCaps(e.getModifierState("CapsLock"))
		} catch {
			/* not supported */
		}
	}

	const submit = async (e: FormEvent) => {
		e.preventDefault()
		setBusy(true)
		setError(null)
		try {
			const r = await api<LoginResponse>("/api/auth/login", {
				method: "POST",
				json: { username: username.trim().toLowerCase(), password, totp: needTotp && totp ? totp : undefined },
			})
			if (r.ok) {
				router.replace("/dashboard")
				router.refresh()
				return
			}
			if (r.reason === "totp_required") {
				setNeedTotp(true)
				return
			}
			setError(t(REASON_KEY[r.reason] ?? "error_generic"))
			if (r.reason === "totp_invalid") setTotp("")
		} catch (err) {
			setError(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setBusy(false)
		}
	}

	const features = [
		{ icon: Server, title: L("مدیریت چندسروره", "Multi-server control"), sub: L("همه پنل‌های 3x-ui در یک داشبورد", "Every 3x-ui panel in one dashboard") },
		{ icon: Zap, title: L("ساخت سریع کانفیگ", "Instant config delivery"), sub: L("لینک و اشتراک با دامنهٔ درست هر اینباند", "Links built from each inbound's own domain") },
		{ icon: Wallet, title: L("فروش و کیف پول", "Sales & wallet"), sub: L("پلن، سفارش و پرداخت خودکار", "Plans, orders and automated payments") },
	]

	return (
		<main className="srp-auth relative">
			<div className="aurora" />
			<div className="srp-orb srp-orb-a" />
			<div className="srp-orb srp-orb-b" />

			<div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4">
				<Logo compact className="lg:hidden" />
				<div className="hidden lg:block">
					<Logo />
				</div>
				<div className="flex items-center gap-1.5">
					<button type="button" onClick={switchLang} className="btn btn-ghost btn-sm" title={t("language")} aria-label={t("language")}>
						<Globe2 className="h-4 w-4" />
						<span className="text-xs">{locale === "fa" ? "EN" : "فا"}</span>
					</button>
					<button type="button" onClick={switchTheme} className="btn btn-ghost btn-sm" title={t("theme_toggle")} aria-label={t("theme_toggle")}>
						{light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
					</button>
				</div>
			</div>

			<div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-6 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:py-10">
				{/* brand story - desktop only */}
				<section className="hidden lg:block">
					<span className="inline-flex items-center gap-1 rounded-full border border-violet/30 bg-violet/15 px-2.5 py-0.5 text-[11px] font-semibold text-violet">{L("نسخهٔ ابری", "Cloud edition")}</span>
					<h1 className="mt-4 text-4xl font-black leading-[1.15]">
						<span className="neon-text">{t("login_title")}</span>
					</h1>
					<p className="mt-3 max-w-md text-sm leading-7 text-muted">{t("login_sub")}</p>
					<div className="mt-9 grid max-w-lg gap-5">
						{features.map((f) => {
							const Icon = f.icon
							return (
								<div key={f.title} className="srp-feature">
									<span className="srp-ico-pill">
										<Icon className="h-5 w-5" />
									</span>
									<div className="pt-1">
										<div className="text-sm font-semibold">{f.title}</div>
										<div className="mt-0.5 text-xs leading-5 text-muted">{f.sub}</div>
									</div>
								</div>
							)
						})}
					</div>
				</section>

				{/* sign-in card */}
				<section className="w-full justify-self-center lg:justify-self-end">
					<div className="srp-card glass neon-ring mx-auto w-full max-w-[440px] p-5 sm:p-7">
						<div className="mb-5 text-center lg:text-start">
							<h2 className="text-lg font-bold sm:text-xl">{needTotp ? t("totp_code") : t("login_title")}</h2>
							<p className="mt-1 text-xs leading-5 text-muted sm:text-sm">{needTotp ? t("totp_hint") : t("login_sub")}</p>
						</div>

						<form onSubmit={submit} className="space-y-4">
							{!needTotp ? (
								<>
									<Field label={t("username")}>
										<div className="relative">
											<UserRound className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-muted" />
											<Input
												className="ps-10 text-start"
												dir="ltr"
												name="username"
												autoComplete="username"
												autoCapitalize="none"
												autoCorrect="off"
												spellCheck={false}
												enterKeyHint="next"
												required
												value={username}
												onChange={(e) => setUsername(e.target.value)}
											/>
										</div>
									</Field>

									<div className="space-y-1.5">
										<Field label={t("password")}>
											<div className="relative">
												<LockKeyhole className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-muted" />
												<Input
													className="ps-10 pe-12 text-start"
													dir="ltr"
													name="password"
													type={showPass ? "text" : "password"}
													autoComplete="current-password"
													enterKeyHint="go"
													required
													value={password}
													onKeyUp={trackCaps}
													onKeyDown={trackCaps}
													onChange={(e) => setPassword(e.target.value)}
												/>
												<button
													type="button"
													onClick={() => setShowPass((v) => !v)}
													className="absolute top-1/2 end-2 -translate-y-1/2 rounded-xl p-2 text-muted transition hover:opacity-70"
													aria-label={showPass ? L("پنهان کردن رمز", "Hide password") : L("نمایش رمز", "Show password")}
													title={showPass ? L("پنهان کردن رمز", "Hide password") : L("نمایش رمز", "Show password")}
												>
													{showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
												</button>
											</div>
										</Field>
										{caps && <p className="text-[11px] text-amber-400">{L("کلید Caps Lock روشن است", "Caps Lock is on")}</p>}
									</div>
								</>
							) : (
								<div className="space-y-3">
									<div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
										<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet/15 text-violet">
											<ShieldCheck className="h-5 w-5" />
										</div>
										<div className="text-sm">
											<div className="font-medium">{t("totp_code")}</div>
											<div className="text-xs text-muted">{t("totp_hint")}</div>
										</div>
									</div>
									<Field label={t("totp_code")}>
										<div className="relative">
											<KeyRound className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-muted" />
											<Input
												className="srp-otp mono ps-10 text-lg"
												dir="ltr"
												inputMode="numeric"
												pattern="[0-9]{6}"
												maxLength={6}
												autoFocus
												autoComplete="one-time-code"
												enterKeyHint="go"
												required
												value={totp}
												onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
											/>
										</div>
									</Field>
								</div>
							)}

							{error && (
								<div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
									<Info className="mt-0.5 h-4 w-4 shrink-0" />
									<span>{error}</span>
								</div>
							)}

							<Button type="submit" variant="primary" className="w-full" loading={busy} disabled={busy || (needTotp && totp.length !== 6)}>
								{t("sign_in")}
							</Button>

							{needTotp && (
								<button
									type="button"
									className="btn btn-ghost btn-sm w-full"
									onClick={() => {
										setNeedTotp(false)
										setTotp("")
										setError(null)
									}}
								>
									{t("cancel")}
								</button>
							)}

							<div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted">
								<ShieldCheck className="h-3.5 w-3.5" />
								<span>{L("اتصال امن و پشتیبانی از ورود دومرحله‌ای", "Secure session with two-factor support")}</span>
							</div>
						</form>
					</div>
					<p className="mt-5 text-center text-[11px] text-muted">{t("brand_tagline")}</p>
				</section>
			</div>
		</main>
	)
}
