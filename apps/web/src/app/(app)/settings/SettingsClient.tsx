"use client"

import { useRouter } from "next/navigation"
import React, { useState, type FormEvent } from "react"
import { KeyRound, Palette, ShieldCheck, UserCircle2 } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import type { AdminDto } from "@/lib/dto"
import { formatDate } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { QR } from "@/components/QR"
import { Badge, Button, Card, Field, Input, useToast } from "@/components/ui"

type Brand = { name: string; tagline: string; logoUrl: string; primaryColor: string; accentColor: string; supportUrl: string; telegramUrl: string }

export function SettingsClient({ me, brand: initialBrand }: { me: AdminDto; brand: Brand }) {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const router = useRouter()

	/* password */
	const [pw, setPw] = useState({ current: "", next: "", confirm: "" })
	const [pwBusy, setPwBusy] = useState(false)
	const changePassword = async (e: FormEvent) => {
		e.preventDefault()
		if (pw.next !== pw.confirm) return toast.err(t("set_pw_mismatch"))
		setPwBusy(true)
		try {
			await api("/api/auth/password", { method: "POST", json: { current: pw.current, next: pw.next } })
			setPw({ current: "", next: "", confirm: "" })
			toast.ok(t("set_pw_changed"))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setPwBusy(false)
		}
	}

	/* 2fa */
	const [totpEnabled, setTotpEnabled] = useState(me.totpEnabled)
	const [setup, setSetup] = useState<{ secret: string; url: string } | null>(null)
	const [code, setCode] = useState("")
	const [totpBusy, setTotpBusy] = useState(false)
	const totp = async (action: "begin" | "confirm" | "disable") => {
		setTotpBusy(true)
		try {
			if (action === "begin") {
				setSetup(await api<{ secret: string; url: string }>("/api/auth/totp", { method: "POST", json: { action } }))
			} else {
				await api("/api/auth/totp", { method: "POST", json: { action, code } })
				setTotpEnabled(action === "confirm")
				setSetup(null)
				setCode("")
				toast.ok(action === "confirm" ? t("set_2fa_enabled") : t("set_2fa_disabled"))
				router.refresh()
			}
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setTotpBusy(false)
		}
	}

	/* brand */
	const [brand, setBrand] = useState(initialBrand)
	const [brandBusy, setBrandBusy] = useState(false)
	const setB = <K extends keyof Brand>(k: K, v: Brand[K]) => setBrand((b) => ({ ...b, [k]: v }))
	const saveBrand = async (e: FormEvent) => {
		e.preventDefault()
		setBrandBusy(true)
		try {
			await api("/api/settings/brand", { method: "PUT", json: brand })
			toast.ok(t("set_saved"))
			router.refresh()
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setBrandBusy(false)
		}
	}

	return (
		<div className="space-y-4">
			<h1 className="text-xl font-bold sm:text-2xl">{t("set_title")}</h1>

			<div className="grid gap-4 xl:grid-cols-2">
				{/* account */}
				<Card title={<span className="flex items-center gap-2"><UserCircle2 className="h-4 w-4 text-violet-soft" />{t("set_account")}</span>}>
					<dl className="grid grid-cols-2 gap-3 text-sm">
						<div><dt className="text-xs text-muted">{t("ad_username")}</dt><dd className="mono">@{me.username}</dd></div>
						<div><dt className="text-xs text-muted">{t("ad_display_name")}</dt><dd>{me.displayName || "—"}</dd></div>
						<div><dt className="text-xs text-muted">{t("status")}</dt><dd><Badge tone={me.role === "OWNER" ? "violet" : "cyan"}>{me.role === "OWNER" ? t("owner") : t("admin")}</Badge></dd></div>
						<div><dt className="text-xs text-muted">{t("ad_last_login")}</dt><dd>{me.lastLoginAt ? formatDate(me.lastLoginAt, locale, true) : "—"}</dd></div>
					</dl>
				</Card>

				{/* password */}
				<Card title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-violet-soft" />{t("set_password")}</span>}>
					<form onSubmit={changePassword} className="space-y-3">
						<Field label={t("set_pw_current")}><Input type="password" className="mono text-start" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required autoComplete="current-password" /></Field>
						<div className="grid grid-cols-2 gap-3">
							<Field label={t("set_pw_new")}><Input type="password" className="mono text-start" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={8} autoComplete="new-password" /></Field>
							<Field label={t("set_pw_confirm")}><Input type="password" className="mono text-start" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required minLength={8} autoComplete="new-password" /></Field>
						</div>
						<div className="flex justify-end"><Button variant="primary" type="submit" loading={pwBusy}>{t("save")}</Button></div>
					</form>
				</Card>

				{/* 2fa */}
				<Card title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-violet-soft" />{t("set_2fa")}</span>} actions={<Badge tone={totpEnabled ? "success" : "muted"}>{totpEnabled ? t("enabled") : t("disabled")}</Badge>}>
					<p className="mb-3 text-xs text-muted">{t("set_2fa_hint")}</p>
					{!totpEnabled && !setup && <Button variant="primary" onClick={() => totp("begin")} loading={totpBusy}>{t("set_2fa_enable")}</Button>}
					{!totpEnabled && setup && (
						<div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
							<QR value={setup.url} size={168} />
							<div className="flex-1 space-y-2">
								<p className="text-xs text-muted">{t("set_2fa_scan")}</p>
								<code className="mono block break-all rounded-lg border border-line bg-surface p-2 text-xs">{setup.secret}</code>
								<div className="flex gap-2">
									<Input className="mono text-center tracking-widest" inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
									<Button variant="primary" onClick={() => totp("confirm")} loading={totpBusy} disabled={code.length !== 6}>{t("confirm")}</Button>
								</div>
							</div>
						</div>
					)}
					{totpEnabled && (
						<div className="flex gap-2">
							<Input className="mono max-w-40 text-center tracking-widest" inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
							<Button variant="danger" onClick={() => totp("disable")} loading={totpBusy} disabled={code.length !== 6}>{t("set_2fa_disable")}</Button>
						</div>
					)}
				</Card>

				{/* brand */}
				<Card title={<span className="flex items-center gap-2"><Palette className="h-4 w-4 text-violet-soft" />{t("set_brand")}</span>} subtitle={t("set_brand_hint")}>
					<form onSubmit={saveBrand} className="space-y-3">
						<div className="grid grid-cols-2 gap-3">
							<Field label={t("set_brand_name")}><Input value={brand.name} onChange={(e) => setB("name", e.target.value)} required maxLength={40} /></Field>
							<Field label={t("set_brand_tagline")}><Input value={brand.tagline} onChange={(e) => setB("tagline", e.target.value)} maxLength={80} /></Field>
						</div>
						<Field label={t("set_brand_logo")}><Input className="mono text-start" value={brand.logoUrl} onChange={(e) => setB("logoUrl", e.target.value)} placeholder="https://…/logo.png" /></Field>
						<div className="grid grid-cols-2 gap-3">
							<Field label={t("set_brand_primary")}>
								<div className="flex items-center gap-2"><input type="color" className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-transparent" value={brand.primaryColor} onChange={(e) => setB("primaryColor", e.target.value)} /><Input className="mono text-start" value={brand.primaryColor} onChange={(e) => setB("primaryColor", e.target.value)} pattern="#[0-9a-fA-F]{6}" /></div>
							</Field>
							<Field label={t("set_brand_accent")}>
								<div className="flex items-center gap-2"><input type="color" className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-transparent" value={brand.accentColor} onChange={(e) => setB("accentColor", e.target.value)} /><Input className="mono text-start" value={brand.accentColor} onChange={(e) => setB("accentColor", e.target.value)} pattern="#[0-9a-fA-F]{6}" /></div>
							</Field>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<Field label={t("set_brand_support")}><Input className="mono text-start" value={brand.supportUrl} onChange={(e) => setB("supportUrl", e.target.value)} placeholder="https://t.me/support" /></Field>
							<Field label={t("set_brand_telegram")}><Input className="mono text-start" value={brand.telegramUrl} onChange={(e) => setB("telegramUrl", e.target.value)} placeholder="https://t.me/channel" /></Field>
						</div>
						{/* live preview */}
						<div className="glass glass-2 flex items-center gap-3 p-3" style={{ "--brand-primary": brand.primaryColor, "--brand-accent": brand.accentColor } as React.CSSProperties}>
							{brand.logoUrl ? <img src={brand.logoUrl} alt="" className="h-10 w-10 rounded-xl object-contain" /> : <div className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold text-white" style={{ background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.accentColor})` }}>{brand.name.slice(0, 1).toUpperCase() || "S"}</div>}
							<div><div className="font-semibold">{brand.name || "SRPanel"}</div><div className="text-[11px] text-muted">{brand.tagline || t("brand_tagline")}</div></div>
						</div>
						<div className="flex justify-end"><Button variant="primary" type="submit" loading={brandBusy}>{t("save")}</Button></div>
					</form>
				</Card>
			</div>
		</div>
	)
}
