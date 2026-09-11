"use client"

import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { KeyRound, Languages, LockKeyhole, ShieldCheck, UserRound } from "lucide-react"
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

export default function LoginPage() {
	const t = useT()
	const locale = useLocale()
	const router = useRouter()
	const [username, setUsername] = useState("")
	const [password, setPassword] = useState("")
	const [totp, setTotp] = useState("")
	const [needTotp, setNeedTotp] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	const switchLang = () => {
		document.cookie = `srp_lang=${locale === "fa" ? "en" : "fa"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
		router.refresh()
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

	return (
		<main className="relative flex min-h-screen items-center justify-center p-4">
			<div className="aurora" />
			<button type="button" onClick={switchLang} className="btn btn-ghost btn-sm absolute top-4 end-4" title={t("language")}>
				<Languages className="h-4 w-4" />
				<span>{locale === "fa" ? "EN" : "فا"}</span>
			</button>

			<div className="fade-up w-full max-w-[420px]">
				<div className="mb-6 flex flex-col items-center gap-3 text-center">
					<Logo />
					<div>
						<h1 className="text-xl font-bold">{t("login_title")}</h1>
						<p className="mt-1 text-sm text-muted">{t("login_sub")}</p>
					</div>
				</div>

				<form onSubmit={submit} className="glass neon-ring space-y-4 p-6 sm:p-7">
					{!needTotp ? (
						<>
							<Field label={t("username")}>
								<div className="relative">
									<UserRound className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-muted" />
									<Input className="ps-10 text-start" dir="ltr" autoComplete="username" autoCapitalize="none" required value={username} onChange={(e) => setUsername(e.target.value)} />
								</div>
							</Field>
							<Field label={t("password")}>
								<div className="relative">
									<LockKeyhole className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-muted" />
									<Input className="ps-10 text-start" dir="ltr" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
								</div>
							</Field>
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
									<Input className="mono ps-10 text-center text-lg tracking-[0.4em]" dir="ltr" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoFocus autoComplete="one-time-code" required value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))} />
								</div>
							</Field>
						</div>
					)}

					{error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

					<Button type="submit" variant="primary" className="w-full" loading={busy} disabled={needTotp && totp.length !== 6}>
						{t("sign_in")}
					</Button>

					{needTotp && (
						<button type="button" className="btn btn-ghost btn-sm w-full" onClick={() => { setNeedTotp(false); setTotp(""); setError(null) }}>
							{t("cancel")}
						</button>
					)}
				</form>

				<p className="mt-6 text-center text-xs text-muted">{t("brand_tagline")}</p>
			</div>
		</main>
	)
}
