"use client"

import { useEffect, useState, type FormEvent } from "react"
import { ExternalLink, Plus, ShieldCheck, X } from "lucide-react"
import { api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Field, Input, Select, Spinner, SubHead, Switch, Textarea, cx, useToast } from "@/components/ui"
import { CopyBtn } from "./parts"
import { PAGE_ICONS, tr, type PageCard, type PageDto, type PageFaq, type PageStep, type StoreExtras, type StorePageIcon, type StoreSettings } from "./types"

const ICON_LABEL: Record<StorePageIcon, { fa: string; en: string }> = {
	shield: { fa: "سپر / امنیت", en: "Shield" },
	bolt: { fa: "سرعت", en: "Speed" },
	globe: { fa: "جهانی", en: "Global" },
	headset: { fa: "پشتیبانی", en: "Support" },
	infinity: { fa: "نامحدود", en: "Unlimited" },
	lock: { fa: "قفل / حریم", en: "Privacy" },
	device: { fa: "چند دستگاه", en: "Devices" },
	star: { fa: "کیفیت", en: "Quality" },
	clock: { fa: "تحویل سریع", en: "Instant" },
	wallet: { fa: "پرداخت", en: "Payment" },
}

/** General store settings + the editable public storefront content. */
export function SettingsTab({ initial }: { initial: StoreSettings }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [s, setS] = useState<StoreSettings>(initial)
	const [pg, setPg] = useState<PageDto | null>(null)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)

	const set = <K extends keyof StoreSettings>(k: K, v: StoreSettings[K]) => setS((x) => ({ ...x, [k]: v }))
	const setPage = (p: Partial<PageDto>) => setPg((x) => (x ? { ...x, ...p } : x))

	useEffect(() => {
		let alive = true
		api<StoreExtras>("/api/store/extras")
			.then((d) => {
				if (alive) setPg(d.page)
			})
			.catch((e: unknown) => toast.err(e instanceof Error ? e.message : t("error_generic")))
			.finally(() => {
				if (alive) setLoading(false)
			})
		return () => {
			alive = false
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const editFeature = (i: number, p: Partial<PageCard>) => pg && setPage({ features: pg.features.map((f, j) => (j === i ? { ...f, ...p } : f)) })
	const editStep = (i: number, p: Partial<PageStep>) => pg && setPage({ steps: pg.steps.map((f, j) => (j === i ? { ...f, ...p } : f)) })
	const editFaq = (i: number, p: Partial<PageFaq>) => pg && setPage({ faq: pg.faq.map((f, j) => (j === i ? { ...f, ...p } : f)) })

	async function save(e: FormEvent) {
		e.preventDefault()
		setSaving(true)
		try {
			const saved = await api<StoreSettings>("/api/store/settings", {
				method: "PUT",
				json: {
					enabled: s.enabled,
					slug: s.slug,
					title: s.title,
					description: s.description,
					rules: s.rules,
					supportUrl: s.supportUrl,
					requireTelegram: s.requireTelegram,
					requirePhone: s.requirePhone,
					paymentTtlMin: Number(s.paymentTtlMin) || 60,
				},
			})
			setS(saved)
			if (pg) {
				const extras = await api<StoreExtras>("/api/store/extras", { method: "PUT", json: { page: pg } })
				setPg(extras.page)
			}
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
	}

	return (
		<form onSubmit={save} className="space-y-4">
			<Card title={t("store_general")}>
				<div className="grid gap-4 md:grid-cols-2">
					<div className="tile flex flex-wrap items-center justify-between gap-3 md:col-span-2">
						<Switch checked={s.enabled} onChange={(v) => set("enabled", v)} label={t("store_enabled")} />
						<div className="flex min-w-0 items-center gap-2">
							<code className="mono truncate text-[11px] text-muted">{s.url}</code>
							<CopyBtn value={s.url} />
							<a className="btn btn-ghost btn-sm" href={s.url} target="_blank" rel="noreferrer">
								<ExternalLink className="h-4 w-4" />
							</a>
						</div>
					</div>
					<Field label={t("store_slug")} hint={t("store_slug_hint")}>
						<Input className="mono" value={s.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} />
					</Field>
					<Field label={t("store_title")}>
						<Input value={s.title ?? ""} onChange={(e) => set("title", e.target.value)} />
					</Field>
					<Field label={t("store_desc")}>
						<Textarea rows={2} value={s.description ?? ""} onChange={(e) => set("description", e.target.value)} />
					</Field>
					<Field label={t("store_rules")} hint={t("store_rules_hint")}>
						<Textarea rows={2} value={s.rules ?? ""} onChange={(e) => set("rules", e.target.value)} />
					</Field>
					<Field label={t("store_support")}>
						<Input dir="ltr" value={s.supportUrl ?? ""} onChange={(e) => set("supportUrl", e.target.value)} placeholder="https://t.me/…" />
					</Field>
					<Field label={t("store_ttl")} hint={t("store_ttl_hint")}>
						<Input type="number" min={5} max={1440} value={s.paymentTtlMin} onChange={(e) => set("paymentTtlMin", Number(e.target.value))} />
					</Field>
					<div className="md:col-span-2">
						<SubHead
							title={
								<span className="inline-flex items-center gap-2">
									<ShieldCheck className="h-4 w-4" /> {L("احراز خریدار", "Customer checks")}
								</span>
							}
						/>
						<div className="flex flex-wrap gap-6">
							<Switch checked={s.requireTelegram} onChange={(v) => set("requireTelegram", v)} label={t("store_req_tg")} />
							<Switch checked={s.requirePhone} onChange={(v) => set("requirePhone", v)} label={t("store_req_phone")} />
						</div>
						<div className="pt-2 text-[11px] text-muted">{L("تنظیمات روش‌های پرداخت به تب «پرداخت‌ها» منتقل شده است.", "Payment configuration now lives in the Payments tab.")}</div>
					</div>
				</div>
			</Card>

			<Card title={L("صفحهٔ فروشگاه", "Storefront page")} subtitle={L("محتوای صفحهٔ عمومی که مشتری می‌بیند", "What your customers see on the public page")}>
				{loading || !pg ? (
					<div className="flex items-center justify-center py-10">
						<Spinner />
					</div>
				) : (
					<div className="space-y-6">
						<div className="flex flex-wrap gap-x-6 gap-y-3">
							<Switch checked={pg.showHero} onChange={(v) => setPage({ showHero: v })} label={L("بخش معرفی", "Hero")} />
							<Switch checked={pg.showTrust} onChange={(v) => setPage({ showTrust: v })} label={L("نشان‌های اعتماد", "Trust badges")} />
							<Switch checked={pg.showFeatures} onChange={(v) => setPage({ showFeatures: v })} label={L("ویژگی‌ها", "Features")} />
							<Switch checked={pg.showSteps} onChange={(v) => setPage({ showSteps: v })} label={L("مراحل خرید", "Steps")} />
							<Switch checked={pg.showFaq} onChange={(v) => setPage({ showFaq: v })} label={L("سوالات متداول", "FAQ")} />
							<Switch checked={pg.showUsdtPrice} onChange={(v) => setPage({ showUsdtPrice: v })} label={L("نمایش قیمت دولاری", "Show USD price")} />
						</div>

						<div className="space-y-3">
							<SubHead title={L("بخش معرفی", "Hero")} hint={L("اولین چیزی که مشتری می‌بیند", "The first thing visitors read")} />
							<div className={cx("grid gap-3 transition md:grid-cols-2", !pg.showHero && "opacity-60")}>
								<Field label={L("برچسب بالای عنوان", "Badge")}>
									<Input value={pg.heroBadge} onChange={(e) => setPage({ heroBadge: e.target.value })} />
								</Field>
								<Field label={L("متن دکمهٔ اصلی", "Primary button")}>
									<Input value={pg.heroCta} onChange={(e) => setPage({ heroCta: e.target.value })} />
								</Field>
								<div className="md:col-span-2">
									<Field label={L("عنوان اصلی", "Headline")}>
										<Input value={pg.heroTitle} onChange={(e) => setPage({ heroTitle: e.target.value })} />
									</Field>
								</div>
								<div className="md:col-span-2">
									<Field label={L("توضیح کوتاه", "Subtitle")}>
										<Textarea rows={2} value={pg.heroSubtitle} onChange={(e) => setPage({ heroSubtitle: e.target.value })} />
									</Field>
								</div>
								<Field label={L("تعداد مشتری", "Customers")}>
									<Input value={pg.statCustomers} onChange={(e) => setPage({ statCustomers: e.target.value })} placeholder="+12000" />
								</Field>
								<div className="grid grid-cols-2 gap-3">
									<Field label={L("آپ‌تایم", "Uptime")}>
										<Input value={pg.statUptime} onChange={(e) => setPage({ statUptime: e.target.value })} placeholder="99.9%" />
									</Field>
									<Field label={L("لوکیشن", "Locations")}>
										<Input value={pg.statLocations} onChange={(e) => setPage({ statLocations: e.target.value })} placeholder="8" />
									</Field>
								</div>
							</div>
						</div>

						<div className="space-y-2">
							<SubHead title={L("نشان‌های اعتماد", "Trust badges")} />
							<div className="flex flex-wrap gap-x-6 gap-y-3">
								<Switch checked={pg.trustInstant} onChange={(v) => setPage({ trustInstant: v })} label={L("تحویل فوری", "Instant delivery")} />
								<Switch checked={pg.trustMoneyBack} onChange={(v) => setPage({ trustMoneyBack: v })} label={L("ضمانت بازگشت وجه", "Money-back")} />
								<Switch checked={pg.trustSupport} onChange={(v) => setPage({ trustSupport: v })} label={L("پشتیبانی ۲۴ ساعته", "24/7 support")} />
								<Switch checked={pg.trustMultiDevice} onChange={(v) => setPage({ trustMultiDevice: v })} label={L("چند دستگاهه", "Multi-device")} />
							</div>
						</div>

						<div className="space-y-2">
							<SubHead title={L("ویژگی‌ها", "Features")} hint={L("کارت‌های مزیت سرویس", "Selling points")} />
							{pg.features.map((f, i) => (
								<div key={"f" + String(i)} className="tile grid gap-2 md:grid-cols-[11rem_1fr_auto]">
									<Select value={f.icon} onChange={(e) => editFeature(i, { icon: e.target.value as StorePageIcon })}>
										{PAGE_ICONS.map((ic) => (
											<option key={ic} value={ic}>
												{L(ICON_LABEL[ic].fa, ICON_LABEL[ic].en)}
											</option>
										))}
									</Select>
									<div className="grid gap-2">
										<Input value={f.title} onChange={(e) => editFeature(i, { title: e.target.value })} placeholder={L("عنوان", "Title")} />
										<Textarea rows={2} value={f.text} onChange={(e) => editFeature(i, { text: e.target.value })} placeholder={L("توضیح", "Description")} />
									</div>
									<Button type="button" size="sm" variant="ghost" title={L("حذف", "Remove")} onClick={() => setPage({ features: pg.features.filter((_, j) => j !== i) })}>
										<X className="h-4 w-4" />
									</Button>
								</div>
							))}
							<Button type="button" size="sm" variant="ghost" onClick={() => setPage({ features: [...pg.features, { icon: "shield", title: "", text: "" }] })}>
								<Plus className="h-4 w-4" /> {L("افزودن ویژگی", "Add feature")}
							</Button>
						</div>

						<div className="space-y-2">
							<SubHead title={L("مراحل خرید", "Purchase steps")} />
							{pg.steps.map((st, i) => (
								<div key={"s" + String(i)} className="tile grid gap-2 md:grid-cols-[2rem_1fr_auto] md:items-start">
									<div className="num pt-2 text-xs text-muted">{i + 1}</div>
									<div className="grid gap-2">
										<Input value={st.title} onChange={(e) => editStep(i, { title: e.target.value })} placeholder={L("عنوان مرحله", "Step title")} />
										<Textarea rows={2} value={st.text} onChange={(e) => editStep(i, { text: e.target.value })} placeholder={L("توضیح", "Description")} />
									</div>
									<Button type="button" size="sm" variant="ghost" title={L("حذف", "Remove")} onClick={() => setPage({ steps: pg.steps.filter((_, j) => j !== i) })}>
										<X className="h-4 w-4" />
									</Button>
								</div>
							))}
							<Button type="button" size="sm" variant="ghost" onClick={() => setPage({ steps: [...pg.steps, { title: "", text: "" }] })}>
								<Plus className="h-4 w-4" /> {L("افزودن مرحله", "Add step")}
							</Button>
						</div>

						<div className="space-y-2">
							<SubHead title={L("سوالات متداول", "FAQ")} />
							{pg.faq.map((q, i) => (
								<div key={"q" + String(i)} className="tile grid gap-2 md:grid-cols-[1fr_auto] md:items-start">
									<div className="grid gap-2">
										<Input value={q.q} onChange={(e) => editFaq(i, { q: e.target.value })} placeholder={L("پرسش", "Question")} />
										<Textarea rows={2} value={q.a} onChange={(e) => editFaq(i, { a: e.target.value })} placeholder={L("پاسخ", "Answer")} />
									</div>
									<Button type="button" size="sm" variant="ghost" title={L("حذف", "Remove")} onClick={() => setPage({ faq: pg.faq.filter((_, j) => j !== i) })}>
										<X className="h-4 w-4" />
									</Button>
								</div>
							))}
							<Button type="button" size="sm" variant="ghost" onClick={() => setPage({ faq: [...pg.faq, { q: "", a: "" }] })}>
								<Plus className="h-4 w-4" /> {L("افزودن سوال", "Add question")}
							</Button>
						</div>

						<div className="space-y-3">
							<SubHead title={L("ارتباط و اطلاعیه", "Contact & notice")} />
							<div className="grid gap-3 md:grid-cols-3">
								<Field label={L("کانال تلگرام", "Telegram channel")}>
									<Input dir="ltr" value={pg.telegramChannel} onChange={(e) => setPage({ telegramChannel: e.target.value.trim() })} placeholder="https://t.me/…" />
								</Field>
								<Field label={L("اینستاگرام", "Instagram")}>
									<Input dir="ltr" value={pg.instagram} onChange={(e) => setPage({ instagram: e.target.value.trim() })} />
								</Field>
								<Field label={L("واتس‌اپ", "WhatsApp")}>
									<Input dir="ltr" value={pg.whatsapp} onChange={(e) => setPage({ whatsapp: e.target.value.trim() })} />
								</Field>
								<div className="md:col-span-2">
									<Field label={L("نوار اطلاعیه", "Notice bar")} hint={L("خالی = نمایش داده نمی‌شود", "Empty = hidden")}>
										<Input value={pg.noticeText} onChange={(e) => setPage({ noticeText: e.target.value })} />
									</Field>
								</div>
								<Field label={L("پانویس", "Footer note")}>
									<Input value={pg.footerNote} onChange={(e) => setPage({ footerNote: e.target.value })} />
								</Field>
							</div>
						</div>
					</div>
				)}
			</Card>

			<div className="sticky bottom-3 z-10">
				<div className="glass glass-2 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
					<div className="flex flex-wrap items-center gap-1.5">
						<Badge tone={s.enabled ? "success" : "muted"}>{s.enabled ? t("active") : t("inactive")}</Badge>
						<span className="text-[11px] text-muted">{L("تغییرات تا زمان ذخیره اعمال نمی‌شود", "Changes apply after saving")}</span>
					</div>
					<Button type="submit" variant="primary" loading={saving}>
						{t("save")}
					</Button>
				</div>
			</div>
		</form>
	)
}
