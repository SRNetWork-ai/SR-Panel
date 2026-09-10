import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import "./globals.css"
import { ToastProvider } from "@/components/ui"
import { currentLocale, currentTheme } from "@/lib/auth"
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
	themeColor: [
		{ media: "(prefers-color-scheme: dark)", color: "#06060d" },
		{ media: "(prefers-color-scheme: light)", color: "#f5f5fa" },
	],
}

export default async function RootLayout({ children }: { children: ReactNode }) {
	const [locale, theme] = await Promise.all([currentLocale(), currentTheme()])
	return (
		<html lang={locale} dir={locale === "fa" ? "rtl" : "ltr"} className={theme === "light" ? "light" : undefined} suppressHydrationWarning>
			<body className="min-h-full antialiased">
				<LocaleProvider locale={locale}>
					<ToastProvider>{children}</ToastProvider>
				</LocaleProvider>
			</body>
		</html>
	)
}
