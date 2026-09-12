"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Globe2, Moon, RotateCcw, Sparkles, Sun, Zap } from "lucide-react"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Switch, useToast } from "@/components/ui"
import { Row, Section } from "@/components/parts"
import { Choice, Gradient } from "./atoms"
import { cookie, resetPrefs, tr, type Brand } from "./types"

export function AppearanceTab({ brand }: { brand: Brand }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const router = useRouter()
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

	const reset = () => {
		resetPrefs()
		setMode("dark")
		setCompact(false)
		setCalm(false)
		toast.ok(L("ظاهر به حالت پیش‌فرض بازگشت", "Appearance reset to defaults"))
	}

	return (
		<div className="grid gap-4 xl:grid-cols-2">
			<Section
				icon={Sparkles}
				title={t("set_appearance")}
				subtitle={L("تم، زبان و حالت نمایش پنل", "Theme, language and display mode")}
				actions={
					<Button type="button" size="sm" variant="ghost" onClick={reset}>
						<RotateCcw className="h-4 w-4" />
						{L("پیش‌فرض", "Defaults")}
					</Button>
				}
			>
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
						<p className="text-[11px] text-muted">{L("این تنظیمات در کوکی مرورگر شما ذخیره می‌شوند و روی ادمین‌های دیگر اثر ندارند.", "These preferences live in your browser cookies and do not affect other admins.")}</p>
					</div>
				</div>
			</Section>

			<Section icon={Zap} title={L("پیش‌نمایش ظاهر", "Appearance preview")} subtitle={L("تغییرات بی‌درنگ اعمال می‌شوند", "Changes apply instantly")}>
				<div className="space-y-3">
					<Gradient from={brand.primaryColor} to={brand.accentColor} className="flex h-16 items-center gap-3 rounded-2xl px-4 text-white shadow-lg">
						<span className="text-sm font-semibold">{brand.name}</span>
						<span className="text-[11px] opacity-90">{L("رنگ برند شما", "Your brand colours")}</span>
					</Gradient>
					<div className="glass-2 tilt flex items-center justify-between gap-3 p-3">
						<div className="text-sm">{L("کارت نمونه", "Sample card")}</div>
						<Badge tone="violet">{t("active")}</Badge>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button type="button" variant="primary" size="sm">
							{L("دکمه اصلی", "Primary")}
						</Button>
						<Button type="button" size="sm">
							{L("دکمه ساده", "Default")}
						</Button>
						<Button type="button" variant="ghost" size="sm">
							{L("شفاف", "Ghost")}
						</Button>
					</div>
					<div className="flex flex-wrap gap-2">
						<Badge tone="success">{L("موفق", "Success")}</Badge>
						<Badge tone="warning">{L("هشدار", "Warning")}</Badge>
						<Badge tone="danger">{L("خطا", "Danger")}</Badge>
						<Badge tone="cyan">{L("اطلاع", "Info")}</Badge>
						<Badge tone="muted">{L("خنسی", "Muted")}</Badge>
					</div>
					<Row label={L("تم فعال", "Active theme")}>{mode === "dark" ? L("تیره", "Dark") : L("روشن", "Light")}</Row>
					<Row label={L("زبان فعال", "Active language")}>{locale === "fa" ? "فارسی" : "English"}</Row>
					<Row label={L("حالت جمع‌وجور", "Compact density")}>{compact ? L("روشن", "On") : L("خاموش", "Off")}</Row>
					<Row label={L("کاهش انیمیشن", "Reduced motion")}>{calm ? L("روشن", "On") : L("خاموش", "Off")}</Row>
					<Row label={L("ساعت مرورگر", "Browser clock")} mono>{now}</Row>
				</div>
			</Section>
		</div>
	)
}
