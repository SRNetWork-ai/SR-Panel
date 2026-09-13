"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Loader2, LogIn, LogOut, UserPlus, Wallet, X } from "lucide-react"
import { api } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { currencyLabel, type CustomerMe, type PublicStore } from "./types"

/** Storefront account session: header chip, login/signup modal and the shared hook. */

const PANEL_STYLE = { background: "rgba(14,15,25,0.97)" } as React.CSSProperties

/** Loads `/api/shop/me` once; a 401 simply means “not logged in”. */
export function useShopAccount(enabled: boolean) {
	const [me, setMe] = useState<CustomerMe | null>(null)
	const [loaded, setLoaded] = useState(!enabled)

	const reload = useCallback(async (): Promise<CustomerMe | null> => {
		if (!enabled) {
			setMe(null)
			setLoaded(true)
			return null
		}
		try {
			const r = await api<CustomerMe>("/api/shop/me")
			setMe(r)
			return r
		} catch {
			setMe(null)
			return null
		} finally {
			setLoaded(true)
		}
	}, [enabled])

	useEffect(() => {
		void reload()
	}, [reload])

	return { me, loaded, reload, setMe }
}

export async function shopLogout(): Promise<void> {
	await api("/api/shop/auth/logout", { method: "POST" }).catch(() => undefined)
}

export function AccountChip({ store, me, onOpen, onLogout }: { store: PublicStore; me: CustomerMe | null; onOpen: () => void; onLogout: () => void }) {
	if (!store.accounts.enabled) return null
	if (!me) {
		return (
			<button type="button" className="btn btn-ghost btn-sm" onClick={onOpen}>
				<LogIn className="h-4 w-4" /> ورود / ثبت‌نام
			</button>
		)
	}
	const credit = Number(me.customer.credit)
	return (
		<div className="flex items-center gap-1">
			<Link href={"/shop/" + store.slug + "/account"} className="btn btn-ghost btn-sm" title="حساب من">
				<Wallet className="h-4 w-4 text-cyan" />
				{store.accounts.walletEnabled ? (
					<span className="num">
						{formatNumber(credit, "fa")} {currencyLabel(store.currency)}
					</span>
				) : (
					<span className="max-w-24 truncate">{me.customer.name || "حساب من"}</span>
				)}
			</Link>
			<button type="button" className="btn btn-ghost btn-sm" onClick={onLogout} title="خروج از حساب">
				<LogOut className="h-4 w-4" />
			</button>
		</div>
	)
}

/** Login + signup in one modal; both end with a session cookie for this store. */
export function AuthModal({ store, open, mode, onClose, onDone }: { store: PublicStore; open: boolean; mode: "login" | "signup"; onClose: () => void; onDone: () => void }) {
	const [tab, setTab] = useState<"login" | "signup">(mode)
	const [form, setForm] = useState({ identity: "", password: "", name: "", email: "", phone: "", telegramId: "" })
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!open) return
		setTab(mode)
		setError(null)
	}, [open, mode])

	if (!open) return null

	async function submit(e: FormEvent) {
		e.preventDefault()
		setError(null)
		setBusy(true)
		try {
			if (tab === "login") {
				await api("/api/shop/" + store.slug + "/auth/login", { method: "POST", json: { identity: form.identity.trim(), password: form.password } })
			} else {
				await api("/api/shop/" + store.slug + "/auth/signup", {
					method: "POST",
					json: { name: form.name || undefined, email: form.email || undefined, phone: form.phone || undefined, telegramId: form.telegramId || undefined, password: form.password },
				})
			}
			onDone()
		} catch (err) {
			setError(err instanceof Error ? err.message : "درخواست ناموفق بود")
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-10" dir="rtl" onClick={onClose}>
			<form
				onSubmit={submit}
				onClick={(e) => e.stopPropagation()}
				style={PANEL_STYLE}
				className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 p-5 shadow-2xl"
			>
				<div className="flex items-center justify-between gap-2">
					<div className="text-sm font-semibold">{tab === "login" ? "ورود به حساب" : "ساخت حساب جدید"}</div>
					<button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="grid grid-cols-2 gap-2 text-sm">
					<button type="button" onClick={() => setTab("login")} className={"rounded-xl p-2 transition " + (tab === "login" ? "bg-violet/25 font-semibold" : "bg-white/5 hover:bg-white/10")}>
						<LogIn className="me-1 inline h-4 w-4" /> ورود
					</button>
					<button type="button" onClick={() => setTab("signup")} className={"rounded-xl p-2 transition " + (tab === "signup" ? "bg-violet/25 font-semibold" : "bg-white/5 hover:bg-white/10")}>
						<UserPlus className="me-1 inline h-4 w-4" /> ثبت‌نام
					</button>
				</div>

				{tab === "login" ? (
					<label className="label">
						ایمیل یا شماره موبایل
						<input className="input mono mt-1" dir="ltr" required value={form.identity} onChange={(e) => setForm({ ...form, identity: e.target.value })} placeholder="you@mail.com یا 09…" />
					</label>
				) : (
					<div className="grid gap-3 sm:grid-cols-2">
						<label className="label sm:col-span-2">
							نام (اختیاری)
							<input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
						</label>
						<label className="label">
							ایمیل {store.accounts.requireEmail ? "*" : ""}
							<input className="input mono mt-1" dir="ltr" type="email" required={store.accounts.requireEmail} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
						</label>
						<label className="label">
							شماره موبایل {store.requirePhone ? "*" : ""}
							<input className="input mono mt-1" dir="ltr" inputMode="tel" required={store.requirePhone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="09…" />
						</label>
						{store.requireTelegram ? (
							<label className="label sm:col-span-2">
								شناسه عددی تلگرام *
								<input className="input mono mt-1" dir="ltr" inputMode="numeric" required value={form.telegramId} onChange={(e) => setForm({ ...form, telegramId: e.target.value.replace(/\D/g, "") })} />
							</label>
						) : null}
						<p className="text-[11px] leading-5 text-muted sm:col-span-2">ایمیل یا شماره موبایل — دست‌کم یکی از این دو لازم است و برای ورود بعدی استفاده می‌شود.</p>
					</div>
				)}

				<label className="label">
					رمز عبور
					<input className="input mono mt-1" dir="ltr" type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="حداقل ۶ کاراکتر" />
				</label>

				{store.termsUrl ? (
					<p className="text-[11px] text-muted">
						با ادامه،{" "}
						<a className="text-cyan underline" href={store.termsUrl} target="_blank" rel="noreferrer">
							قوانین و شرایط
						</a>{" "}
						را می‌پذیرید.
					</p>
				) : null}

				{error ? <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

				<button type="submit" className="btn btn-primary w-full py-2.5" disabled={busy}>
					{busy ? <Loader2 className="h-4 w-4 spin" /> : tab === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
					{tab === "login" ? "ورود" : "ساخت حساب"}
				</button>
			</form>
		</div>
	)
}
