"use client"

import { useState, type FormEvent } from "react"
import { ExternalLink, ShieldCheck } from "lucide-react"
import { api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Field, Input, Select, SubHead, Switch, Textarea, cx, useToast } from "@/components/ui"
import { CopyBtn } from "./parts"
import { tr, type Method, type StoreSettings } from "./types"

export function SettingsTab({ initial }: { initial: StoreSettings }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [s, setS] = useState<StoreSettings>(initial)
	const [merchant, setMerchant] = useState("")
	const [saving, setSaving] = useState(false)
	const set = <K extends keyof StoreSettings>(k: K, v: StoreSettings[K]) => setS((x) => ({ ...x, [k]: v }))
	const liveMethods = [s.usdtEnabled ? "USDT" : null, s.cardEnabled ? "CARD" : null, s.zarinpalEnabled ? "ZARINPAL" : null].filter(Boolean) as Method[]

	async function save(e: FormEvent) {
		e.preventDefault()
		setSaving(true)
		try {
			const body: Record<string, unknown> = {
				enabled: s.enabled,
				slug: s.slug,
				title: s.title,
				description: s.description,
				rules: s.rules,
				supportUrl: s.supportUrl,
				usdtEnabled: s.usdtEnabled,
				usdtAddress: s.usdtAddress,
				usdtNetwork: s.usdtNetwork,
				usdtRate: Number(s.usdtRate) || 0,
				usdtAutoVerify: s.usdtAutoVerify,
				cardEnabled: s.cardEnabled,
				cardNumber: s.cardNumber,
				cardHolder: s.cardHolder,
				cardBank: s.cardBank,
				zarinpalEnabled: s.zarinpalEnabled,
				zarinpalSandbox: s.zarinpalSandbox,
				requireTelegram: s.requireTelegram,
				requirePhone: s.requirePhone,
				paymentTtlMin: Number(s.paymentTtlMin) || 60,
			}
			if (merchant.trim()) body.zarinpalMerchant = merchant.trim()
			const saved = await api<StoreSettings>("/api/store/settings", { method: "PUT", json: body })
			setS(saved)
			setMerchant("")
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
	}

	return (
		<form onSubmit={save} className="grid gap-4 lg:grid-cols-2">
			<Card title={t("store_general")} className="lg:col-span-2">
				<div className="grid gap-4 md:grid-cols-2">
					<div className="tile flex flex-wrap items-center justify-between gap-3 md:col-span-2">
						<Switch checked={s.enabled} onChange={(v) => set("enabled", v)} label={t("store_enabled")} />
						<div className="flex min-w-0 items-center gap-2">
							<code className="mono truncate text-[11px] text-muted">{s.url}</code>
							<CopyBtn value={s.url} />
							<a className="btn btn-ghost btn-sm" href={s.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
						</div>
					</div>
					<Field label={t("store_slug")} hint={t("store_slug_hint")}><Input className="mono" value={s.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} /></Field>
					<Field label={t("store_title")}><Input value={s.title ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
					<Field label={t("store_desc")}><Textarea rows={2} value={s.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
					<Field label={t("store_rules")} hint={t("store_rules_hint")}><Textarea rows={2} value={s.rules ?? ""} onChange={(e) => set("rules", e.target.value)} /></Field>
					<Field label={t("store_support")}><Input dir="ltr" value={s.supportUrl ?? ""} onChange={(e) => set("supportUrl", e.target.value)} placeholder="https://t.me/…" /></Field>
					<Field label={t("store_ttl")} hint={t("store_ttl_hint")}><Input type="number" min={5} max={1440} value={s.paymentTtlMin} onChange={(e) => set("paymentTtlMin", Number(e.target.value))} /></Field>
					<div className="md:col-span-2">
						<SubHead title={<span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> {L("احراز خریدار", "Customer checks")}</span>} />
						<div className="flex flex-wrap gap-6">
							<Switch checked={s.requireTelegram} onChange={(v) => set("requireTelegram", v)} label={t("store_req_tg")} />
							<Switch checked={s.requirePhone} onChange={(v) => set("requirePhone", v)} label={t("store_req_phone")} />
						</div>
					</div>
				</div>
			</Card>

			<Card title={t("pay_m_USDT")} subtitle={t("pay_usdt_sub")} actions={<Switch checked={s.usdtEnabled} onChange={(v) => set("usdtEnabled", v)} />}>
				<div className={cx("space-y-3 transition", !s.usdtEnabled && "opacity-60")}>
					<Field label={t("pay_usdt_address")}>
						<div className="flex gap-2">
							<Input dir="ltr" className="mono" value={s.usdtAddress ?? ""} onChange={(e) => set("usdtAddress", e.target.value.trim())} placeholder="T…" />
							{s.usdtAddress ? <CopyBtn value={s.usdtAddress} /> : null}
						</div>
					</Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label={t("pay_usdt_network")}><Select value={s.usdtNetwork} onChange={(e) => set("usdtNetwork", e.target.value)}><option value="TRC20">TRC20 (Tron)</option></Select></Field>
						<Field label={t("pay_usdt_rate")} hint={t("pay_usdt_rate_hint")}><Input type="number" min={0} value={s.usdtRate} onChange={(e) => set("usdtRate", Number(e.target.value))} /></Field>
					</div>
					<Switch checked={s.usdtAutoVerify} onChange={(v) => set("usdtAutoVerify", v)} label={t("pay_usdt_auto")} />
				</div>
			</Card>

			<Card title={t("pay_m_CARD")} subtitle={t("pay_card_sub")} actions={<Switch checked={s.cardEnabled} onChange={(v) => set("cardEnabled", v)} />}>
				<div className={cx("space-y-3 transition", !s.cardEnabled && "opacity-60")}>
					<Field label={t("pay_card_number")}>
						<div className="flex gap-2">
							<Input dir="ltr" className="mono" inputMode="numeric" value={s.cardNumber ?? ""} onChange={(e) => set("cardNumber", e.target.value)} placeholder="6037 …" />
							{s.cardNumber ? <CopyBtn value={s.cardNumber} /> : null}
						</div>
					</Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label={t("pay_card_holder")}><Input value={s.cardHolder ?? ""} onChange={(e) => set("cardHolder", e.target.value)} /></Field>
						<Field label={t("pay_card_bank")}><Input value={s.cardBank ?? ""} onChange={(e) => set("cardBank", e.target.value)} /></Field>
					</div>
				</div>
			</Card>

			<Card title={t("pay_m_ZARINPAL")} subtitle={t("pay_zp_sub")} actions={<Switch checked={s.zarinpalEnabled} onChange={(v) => set("zarinpalEnabled", v)} />} className="lg:col-span-2">
				<div className={cx("grid gap-3 transition md:grid-cols-3", !s.zarinpalEnabled && "opacity-60")}>
					<div className="md:col-span-2">
						<Field label={t("pay_zp_merchant")} hint={s.hasZarinpal ? `${t("pay_zp_saved")}: ${s.zarinpalMerchantMasked}` : t("pay_zp_merchant_hint")}>
							<Input dir="ltr" className="mono" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder={s.hasZarinpal ? "••••••••" : "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"} />
						</Field>
					</div>
					<div className="flex items-end pb-1"><Switch checked={s.zarinpalSandbox} onChange={(v) => set("zarinpalSandbox", v)} label={t("pay_zp_sandbox")} /></div>
				</div>
			</Card>

			<div className="sticky bottom-3 z-10 lg:col-span-2">
				<div className="glass glass-2 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
					<div className="flex flex-wrap items-center gap-1.5">
						<Badge tone={s.enabled ? "success" : "muted"}>{s.enabled ? t("active") : t("inactive")}</Badge>
						{liveMethods.length ? liveMethods.map((m) => <Badge key={m} tone="cyan">{t(`pay_m_${m}` as never)}</Badge>) : <Badge tone="warning">{t("store_no_methods")}</Badge>}
						<span className="text-[11px] text-muted">{L("تغییرات تا زمان ذخیره اعمال نمی‌شود", "Changes apply after saving")}</span>
					</div>
					<Button type="submit" variant="primary" loading={saving}>{t("save")}</Button>
				</div>
			</div>
		</form>
	)
}
