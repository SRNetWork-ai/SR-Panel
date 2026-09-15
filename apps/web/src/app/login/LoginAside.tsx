"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Globe2, Moon, Server, Sun, Wallet, Zap } from "lucide-react"
import { Logo } from "@/components/Logo"
import { useLocale, useT } from "@/lib/i18n"

/** Chrome of the sign-in screen: language/theme switches and the brand story. */

function setCookie(name: string, value: string) {
	document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
}

export function LoginTopBar() {
	const t = useT()
	const locale = useLocale()
	const router = useRouter()
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

	return (
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
	)
}

export function LoginAside() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const features = [
		{ icon: Server, title: L("مدیریت چندسروره", "Multi-server control"), sub: L("همه پنل‌های 3x-ui در یک داشبورد", "Every 3x-ui panel in one dashboard") },
		{ icon: Zap, title: L("ساخت سریع کانفیگ", "Instant config delivery"), sub: L("لینک و اشتراک با دامنهٔ درست هر اینباند", "Links built from each inbound's own domain") },
		{ icon: Wallet, title: L("فروش و کیف پول", "Sales & wallet"), sub: L("پلن، سفارش و پرداخت خودکار", "Plans, orders and automated payments") },
	]

	return (
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
	)
}
