import type { Metadata, Viewport } from "next"
import { cookies } from "next/headers"
import type { ReactNode } from "react"
import "./globals.css"
import "./nav3d.css"
import "./motion3d.css"
import "./mobile.css"
// must stay last: fixes transparency / 3D-overflow / duplicated .srp-tab rules above
import "./opaque.css"
import IdleGuard from "@/components/IdleGuard"
import { ToastProvider } from "@/components/ui"
import { IDLE_MIN_COOKIE, SESSION_COOKIE, currentLocale, currentTheme, idleMinutesOf } from "@/lib/auth"
import { LocaleProvider } from "@/lib/i18n"

const BRAND = process.env.SRP_BRAND_NAME || "SRPanel"

export const metadata: Metadata = {
	title: { default: BRAND, template: `%s · ${BRAND}` },
	description: "VPN Reseller Cloud — multi-server 3x-ui management",
	icons: { icon: "/favicon.svg" },
	robots: { index: false, follow: false },
}

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	// lets the shell paint under the notch / home indicator; safe areas are handled in mobile.css
	viewportFit: "cover",
	themeColor: [
		{ media: "(prefers-color-scheme: dark)", color: "#06060d" },
		{ media: "(prefers-color-scheme: light)", color: "#f5f5fa" },
	],
}

export default async function RootLayout({ children }: { children: ReactNode }) {
	const [locale, theme] = await Promise.all([currentLocale(), currentTheme()])
	const jar = await cookies()
	const htmlClass = [theme === "light" ? "light" : "", jar.get("srp_compact")?.value === "1" ? "srp-compact" : "", jar.get("srp_calm")?.value === "1" ? "srp-calm" : ""].filter(Boolean).join(" ")
	const signedIn = !!jar.get(SESSION_COOKIE)?.value
	const idleMinutes = idleMinutesOf(jar.get(IDLE_MIN_COOKIE)?.value)
	return (
		<html lang={locale} dir={locale === "fa" ? "rtl" : "ltr"} className={htmlClass || undefined} suppressHydrationWarning>
			<body className="min-h-full antialiased">
				<LocaleProvider locale={locale}>
					<ToastProvider>
						{signedIn ? <IdleGuard minutes={idleMinutes} /> : null}
						{children}
					</ToastProvider>
				</LocaleProvider>
			</body>
		</html>
	)
}
