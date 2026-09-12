"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { Palette, RotateCcw, Sparkles, Store } from "lucide-react"
import { api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Field, Input, cx, useToast } from "@/components/ui"
import { Row, Section } from "@/components/parts"
import { CopyBtn, Gradient, Swatch } from "./atoms"
import { DEFAULT_ACCENT, DEFAULT_PRIMARY, PALETTES, contrastOnWhite, errMsg, isHex, isUrlish, tr, type Brand } from "./types"

export function BrandTab({ brand, onChange }: { brand: Brand; onChange: (next: Brand) => void }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const router = useRouter()
	const [busy, setBusy] = useState(false)
	const set = (patch: Partial<Brand>) => onChange({ ...brand, ...patch })

	const nameOk = brand.name.trim().length > 0
	const colorsOk = isHex(brand.primaryColor) && isHex(brand.accentColor)
	const urlsOk = isUrlish(brand.logoUrl) && isUrlish(brand.supportUrl) && isUrlish(brand.telegramUrl)
	const valid = nameOk && colorsOk && urlsOk
	const contrast = contrastOnWhite(brand.primaryColor)
	const urlHint = (v: string) => (isUrlish(v) ? undefined : L("باید با http:// یا https:// شروع شود", "Must start with http:// or https://"))

	const save = async (e: FormEvent) => {
		e.preventDefault()
		if (!valid) {
			toast.err(L("مقادیر واردشده معتبر نیست", "Some values are not valid"))
			return
		}
		setBusy(true)
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
			toast.err(errMsg(err, L("ذخیره انجام نشد", "Could not save")))
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="grid gap-4 xl:grid-cols-3">
			<Section className="xl:col-span-2" icon={Palette} title={t("set_brand")} subtitle={t("set_brand_hint")} actions={<Badge tone={valid ? "success" : "warning"}>{valid ? L("آماده ذخیره", "Ready") : L("نیاز به اصلاح", "Needs a fix")}</Badge>}>
				<form id="brand-form" className="space-y-4" onSubmit={save}>
					<div className="grid gap-3 sm:grid-cols-2">
						<Field label={t("set_brand_name")}>
							<Input value={brand.name} onChange={(e) => set({ name: e.target.value })} required maxLength={64} />
						</Field>
						<Field label={t("set_brand_tagline")} hint={`${brand.tagline.length}/140`}>
							<Input value={brand.tagline} onChange={(e) => set({ tagline: e.target.value })} maxLength={140} />
						</Field>
						<Field label={t("set_brand_logo")} hint={urlHint(brand.logoUrl) ?? "https://..."}>
							<Input value={brand.logoUrl} onChange={(e) => set({ logoUrl: e.target.value })} />
						</Field>
						<Field label={t("set_brand_support")} hint={urlHint(brand.supportUrl) ?? "https://..."}>
							<Input value={brand.supportUrl} onChange={(e) => set({ supportUrl: e.target.value })} />
						</Field>
						<Field label={t("set_brand_telegram")} hint={urlHint(brand.telegramUrl) ?? "https://t.me/..."}>
							<Input value={brand.telegramUrl} onChange={(e) => set({ telegramUrl: e.target.value })} />
						</Field>
						<div className="grid grid-cols-2 gap-3">
							<Field label={t("set_brand_primary")}>
								<div className="flex items-center gap-2">
									<Input type="color" className="h-10 w-14 p-1" value={brand.primaryColor} onChange={(e) => set({ primaryColor: e.target.value })} />
									<Input className="mono" value={brand.primaryColor} onChange={(e) => set({ primaryColor: e.target.value })} maxLength={7} />
								</div>
							</Field>
							<Field label={t("set_brand_accent")}>
								<div className="flex items-center gap-2">
									<Input type="color" className="h-10 w-14 p-1" value={brand.accentColor} onChange={(e) => set({ accentColor: e.target.value })} />
									<Input className="mono" value={brand.accentColor} onChange={(e) => set({ accentColor: e.target.value })} maxLength={7} />
								</div>
							</Field>
						</div>
					</div>

					<div className="space-y-2 border-t border-line pt-3">
						<div className="text-xs text-muted">{L("پالت آماده", "Ready-made palettes")}</div>
						<div className="flex flex-wrap gap-2">
							{PALETTES.map((p) => {
								const active = p.primary.toLowerCase() === brand.primaryColor.toLowerCase() && p.accent.toLowerCase() === brand.accentColor.toLowerCase()
								return (
									<button key={p.id} type="button" onClick={() => set({ primaryColor: p.primary, accentColor: p.accent })} className={cx("glass-2 flex items-center gap-2 px-3 py-2 text-xs transition hover:-translate-y-0.5", active ? "border border-violet/50 text-fg" : "text-muted")}>
										<Swatch color={p.primary} />
										<Swatch color={p.accent} />
										{locale === "fa" ? p.fa : p.en}
									</button>
								)
							})}
						</div>
						{contrast > 0 && contrast < 3 ? <p className="text-[11px] text-warning">{L("متن سفید روی این رنگ اصلی کم‌کنتراست است؛ رنگ تیره‌تری انتخاب کنید.", "White text on this primary colour is low contrast; pick a darker shade.")}</p> : null}
					</div>

					<div className="flex flex-wrap items-center justify-between gap-3">
						<span className="text-[11px] text-muted">{L("این برند روی صفحه اشتراک و فروشگاه مشتریان شما دیده می‌شود.", "This brand appears on your store and subscription pages.")}</span>
						<div className="flex flex-wrap gap-2">
							<Button type="button" variant="ghost" onClick={() => set({ primaryColor: DEFAULT_PRIMARY, accentColor: DEFAULT_ACCENT })}>
								<RotateCcw className="h-4 w-4" />
								{L("بازگرداندن رنگ‌ها", "Reset colours")}
							</Button>
							<Button type="submit" variant="primary" loading={busy} disabled={!valid}>
								{t("save")}
							</Button>
						</div>
					</div>
				</form>
			</Section>

			<Section icon={Sparkles} title={L("پیش‌نمایش برند", "Brand preview")} subtitle={L("همان چیزی که مشتری می‌بیند", "What your customer sees")} actions={<CopyBtn value={`${brand.primaryColor} / ${brand.accentColor}`} label={L("کپی کد رنگ‌ها", "Copy colours")} />}>
				<Gradient from={brand.primaryColor} to={brand.accentColor} className="mb-3 flex h-24 items-center gap-3 rounded-2xl px-4 text-white shadow-lg">
					<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/25 text-lg font-bold">{(brand.name || "S").slice(0, 1).toUpperCase()}</div>
					<div className="min-w-0">
						<div className="truncate text-base font-bold">{brand.name}</div>
						<div className="truncate text-xs opacity-90">{brand.tagline || L("فروشگاه اشتراک شما", "Your subscription store")}</div>
					</div>
				</Gradient>
				<div className="glass-2 mb-3 space-y-2 p-3">
					<div className="flex items-center justify-between gap-2">
						<span className="text-sm font-medium">{L("پلن ۳۰ روزه", "30-day plan")}</span>
						<Badge tone="violet">{L("نمونه", "Sample")}</Badge>
					</div>
					<div className="text-[11px] text-muted">{L("۵۰ گیگابایت · ۲ دستگاه · تمدید خودکار", "50 GB · 2 devices · auto renew")}</div>
					<Gradient from={brand.primaryColor} to={brand.accentColor} className="flex h-9 items-center justify-center rounded-xl text-xs font-semibold text-white">
						{L("خرید اشتراک", "Buy subscription")}
					</Gradient>
				</div>
				<Row label={t("set_brand_primary")} mono>{brand.primaryColor}</Row>
				<Row label={t("set_brand_accent")} mono>{brand.accentColor}</Row>
				<Row label={L("کنتراست متن سفید", "White-text contrast")} mono>{contrast ? `${contrast}:1` : "—"}</Row>
				<Row label={L("لوگو", "Logo")} mono>{brand.logoUrl || "—"}</Row>
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
	)
}
