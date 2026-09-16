"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { Clock, Eye, EyeOff, Info, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react"
import { Button, Field, Input } from "@/components/ui"
import { ApiError, api } from "@/lib/client"
import { useLocale, useT, type DictKey } from "@/lib/i18n"
import { LoginAside, LoginTopBar } from "./LoginAside"

type LoginResponse =
	| { ok: true; admin: { id: string; username: string; role: "OWNER" | "ADMIN" } }
	| {
			ok: false
			reason: "invalid" | "disabled" | "totp_required" | "totp_invalid" | "locked" | "email_code_required" | "email_code_invalid"
			retryAfterSec?: number
	  }

const REASON_KEY: Record<string, DictKey> = {
	invalid: "login_invalid",
	disabled: "login_disabled",
	totp_invalid: "login_totp_invalid",
}

/** last operator name, so a returning admin only types the password */
const USER_KEY = "srp_login_user"

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"

/** Persian/Arabic digits (keyboard or paste) become ASCII before they are sent. */
const onlyDigits = (v: string) =>
	v
		.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
		.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
		.replace(/\D/g, "")

/** Same-origin paths only, so `?next=` can never bounce to another site. */
function safeNext(raw: string | null): string {
	if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/login")) return "/dashboard"
	return raw
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

export default function LoginPage() {
	const t = useT()
	const locale = useLocale()
	const router = useRouter()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const [username, setUsername] = useState("")
	const [password, setPassword] = useState("")
	const [showPass, setShowPass] = useState(false)
	const [caps, setCaps] = useState(false)
	const [remember, setRemember] = useState(false)
	const [totp, setTotp] = useState("")
	const [needTotp, setNeedTotp] = useState(false)
	const [emailCode, setEmailCode] = useState("")
	const [needEmail, setNeedEmail] = useState(false)
	const [sentTo, setSentTo] = useState("")
	const [sending, setSending] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [notice, setNotice] = useState<"idle" | "out" | null>(null)
	const [lockSec, setLockSec] = useState(0)
	const [next, setNext] = useState("/dashboard")
	const [busy, setBusy] = useState(false)
	const autoSent = useRef("")
	const autoMail = useRef(false)
	const locked = lockSec > 0

	// the query string is read on the client, so the page stays statically renderable
	useEffect(() => {
		const q = new URLSearchParams(window.location.search)
		setNext(safeNext(q.get("next")))
		const reason = q.get("reason")
		if (reason === "idle" || reason === "out") setNotice(reason)
		try {
			const saved = window.localStorage.getItem(USER_KEY)
			if (saved) {
				setUsername(saved)
				setRemember(true)
			}
		} catch {
			/* storage blocked */
		}
	}, [])

	// live countdown of the brute-force lock
	useEffect(() => {
		if (!locked) return
		const id = window.setInterval(() => setLockSec((s) => Math.max(0, s - 1)), 1000)
		return () => window.clearInterval(id)
	}, [locked])

	const trackCaps = (e: ReactKeyboardEvent<HTMLInputElement>) => {
		try {
			setCaps(e.getModifierState("CapsLock"))
		} catch {
			/* not supported */
		}
	}

	/** the code is mailed only after the server re-checked user + password */
	const sendCode = async () => {
		if (sending || locked || !username.trim() || !password) return
		setSending(true)
		setError(null)
		try {
			const r = await api<{ ok: boolean; to?: string; ttlMin?: number }>("/api/auth/login-code", {
				method: "POST",
				json: { username: username.trim().toLowerCase(), password },
			})
			setNeedEmail(true)
			if (r.ok && r.to) setSentTo(r.to)
		} catch (err) {
			setError(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setSending(false)
		}
	}

	const login = async () => {
		if (busy || locked) return
		setBusy(true)
		setError(null)
		setNotice(null)
		try {
			const r = await api<LoginResponse>("/api/auth/login", {
				method: "POST",
				json: {
					username: username.trim().toLowerCase(),
					password,
					totp: needTotp && totp ? totp : undefined,
					emailCode: needEmail && emailCode.length === 6 ? emailCode : undefined,
				},
			})
			if (r.ok) {
				try {
					if (remember) window.localStorage.setItem(USER_KEY, username.trim().toLowerCase())
					else window.localStorage.removeItem(USER_KEY)
				} catch {
					/* storage blocked */
				}
				router.replace(next)
				router.refresh()
				return
			}
			if (r.reason === "totp_required") {
				setNeedTotp(true)
				return
			}
			if (r.reason === "email_code_required") {
				setNeedEmail(true)
				if (!autoMail.current) {
					autoMail.current = true
					void sendCode()
				}
				return
			}
			if (r.reason === "email_code_invalid") {
				setNeedEmail(true)
				setEmailCode("")
				setError(L("کد ایمیل درست نیست یا منقضی شده.", "The emailed code is wrong or expired."))
				return
			}
			if (r.reason === "locked") {
				setPassword("")
				setTotp("")
				setLockSec(Math.min(3600, Math.max(30, Math.round(r.retryAfterSec ?? 60))))
				return
			}
			setError(t(REASON_KEY[r.reason] ?? "error_generic"))
			if (r.reason === "totp_invalid") setTotp("")
		} catch (err) {
			if (typeof navigator !== "undefined" && !navigator.onLine) setError(L("اتصال اینترنت قطع است؛ شبکه را بررسی کن.", "You are offline — check your connection."))
			else setError(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setBusy(false)
		}
	}

	// a complete 6-digit code is sent on its own (paste or authenticator autofill)
	useEffect(() => {
		if (!needTotp || totp.length !== 6 || busy || locked) return
		if (autoSent.current === totp) return
		autoSent.current = totp
		void login()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [needTotp, totp, busy, locked])

	const submit = (e: FormEvent) => {
		e.preventDefault()
		void login()
	}

	return (
		<main className="srp-auth relative">
			<div className="aurora" />
			<div className="srp-orb srp-orb-a" />
			<div className="srp-orb srp-orb-b" />

			<LoginTopBar />

			<div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-6 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:py-10">
				<LoginAside />

				{/* sign-in card */}
				<section className="w-full justify-self-center lg:justify-self-end">
					<div className="srp-card glass neon-ring mx-auto w-full max-w-[440px] p-5 sm:p-7">
						<div className="mb-5 text-center lg:text-start">
							<h2 className="text-lg font-bold sm:text-xl">{needTotp ? t("totp_code") : t("login_title")}</h2>
							<p className="mt-1 text-xs leading-5 text-muted sm:text-sm">{needTotp ? t("totp_hint") : t("login_sub")}</p>
						</div>

						{notice || next !== "/dashboard" ? (
							<div className="mb-4 flex items-start gap-2 rounded-xl border border-cyan/30 bg-cyan/10 px-3 py-2 text-xs leading-5 text-cyan">
								<Info className="mt-0.5 h-4 w-4 shrink-0" />
								<span>
									{notice === "idle" ? L("به‌دلیل بی‌کاری طولانی از حساب خارج شدی.", "You were signed out after being idle for a while.") : notice === "out" ? L("از حساب خارج شدی.", "You have been signed out.") : null}
									{notice && next !== "/dashboard" ? " " : null}
									{next !== "/dashboard" ? L("بعد از ورود به همان صفحهٔ درخواستی برمی‌گردی.", "You will return to the page you requested.") : null}
								</span>
							</div>
						) : null}

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
												autoFocus
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
										<label className="flex cursor-pointer select-none items-center gap-2 pt-0.5 text-xs text-muted">
											<input type="checkbox" className="h-4 w-4 accent-violet" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
											{L("نام کاربری را به خاطر بسپار", "Remember my username")}
										</label>
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
												onChange={(e) => setTotp(onlyDigits(e.target.value).slice(0, 6))}
											/>
										</div>
									</Field>
								</div>
							)}

							{needEmail && (
								<div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
									<div className="flex items-center gap-2 text-sm font-medium">
										<Mail className="h-4 w-4 text-violet" />
										<span>{L("کد ورود ایمیلی", "Emailed login code")}</span>
									</div>
									<p className="text-xs leading-5 text-muted">
										{sentTo ? L("ارسال شد به ", "Sent to ") + sentTo : L("برای دریافت کد، دکمهٔ زیر را بزن.", "Press the button below to get a code.")}
									</p>
									<Input
										className="srp-otp mono text-lg"
										dir="ltr"
										inputMode="numeric"
										pattern="[0-9]{6}"
										maxLength={6}
										autoComplete="one-time-code"
										value={emailCode}
										onChange={(e) => setEmailCode(onlyDigits(e.target.value).slice(0, 6))}
									/>
									<button type="button" className="btn btn-ghost btn-sm w-full" onClick={() => void sendCode()} disabled={sending || locked}>
										{sentTo ? L("ارسال مجدد کد", "Resend code") : L("ارسال کد به ایمیل", "Email me a code")}
									</button>
								</div>
							)}

							{locked && (
								<div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-400">
									<Clock className="mt-0.5 h-4 w-4 shrink-0" />
									<span>
										{L("تلاش‌های ناموفق زیاد بود؛ ورود موقتاً قفل شد.", "Too many failed attempts — sign-in is locked.")}{" "}
										<span className="mono" dir="ltr">{mmss(lockSec)}</span>
									</span>
								</div>
							)}

							{error && (
								<div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
									<Info className="mt-0.5 h-4 w-4 shrink-0" />
									<span>{error}</span>
								</div>
							)}

							<Button
								type="submit"
								variant="primary"
								className="w-full"
								loading={busy}
								disabled={busy || locked || (needTotp && totp.length !== 6) || (needEmail && emailCode.length !== 6)}
							>
								{locked ? L("ورود قفل است", "Sign-in locked") : t("sign_in")}
							</Button>

							{needTotp && (
								<button
									type="button"
									className="btn btn-ghost btn-sm w-full"
									onClick={() => {
										setNeedTotp(false)
										setTotp("")
										setError(null)
										autoSent.current = ""
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
