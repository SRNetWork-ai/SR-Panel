"use client"

import { useState } from "react"
import { Bell, Clock, KeyRound, Mail, Palette, Settings2, ShieldCheck, Sparkles, Stethoscope, UserCircle2 } from "lucide-react"
import type { AdminDto } from "@/lib/dto"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, PageHeader } from "@/components/ui"
import { Tabs, type TabItem } from "@/components/parts"
import { AccountTab } from "./AccountTab"
import { AlertsTab } from "./AlertsTab"
import { AppearanceTab } from "./AppearanceTab"
import { BrandTab } from "./BrandTab"
import { LicenseTab } from "./LicenseTab"
import { MailTab } from "./MailTab"
import { SecurityTab } from "./SecurityTab"
import { SessionTab } from "./SessionTab"
import { SystemTab } from "./SystemTab"
import { ToolsTab } from "./ToolsTab"
import { tr, type Brand, type SystemInfo, type Tab } from "./types"

export type { SystemInfo } from "./types"

/** `license` and `mail` live only in this screen, so they stay out of the deep-link Tab union. */
type LocalTab = Tab | "license" | "mail"

export function SettingsClient({ me, brand: initialBrand, info, initialTab }: { me: AdminDto; brand: Brand; info: SystemInfo; initialTab?: Tab }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const isOwner = me.role === "OWNER"
	const allowed = initialTab && (initialTab !== "alerts" || isOwner) ? initialTab : "account"
	const [tab, setTab] = useState<LocalTab>(allowed)
	const [brand, setBrand] = useState<Brand>(initialBrand)
	const [totpOn, setTotpOn] = useState(me.totpEnabled)

	const alertsTab: TabItem<LocalTab> = { id: "alerts", label: L("\u0647\u0634\u062f\u0627\u0631 \u0648 \u0633\u06cc\u0627\u0633\u062a\u200c\u0647\u0627", "Alerts & policies"), icon: Bell }
	const mailTab: TabItem<LocalTab> = { id: "mail", label: L("\u0627\u06cc\u0645\u06cc\u0644 \u0648 \u06a9\u062f \u0648\u0631\u0648\u062f", "Email & login code"), icon: Mail }

	const tabs: Array<TabItem<LocalTab>> = [
		{ id: "account", label: t("set_account"), icon: UserCircle2 },
		{ id: "security", label: L("\u0627\u0645\u0646\u06cc\u062a", "Security"), icon: ShieldCheck, badge: totpOn ? "2FA" : undefined },
		{ id: "session", label: L("\u0646\u0634\u0633\u062a \u0648 \u0642\u0641\u0644 \u062e\u0648\u062f\u06a9\u0627\u0631", "Session & lock"), icon: Clock },
		{ id: "brand", label: t("set_brand"), icon: Palette },
		{ id: "appearance", label: t("set_appearance"), icon: Sparkles },
		{ id: "license", label: L("\u0644\u0627\u06cc\u0633\u0646\u0633 \u0648 \u067e\u0631\u0645\u06cc\u0648\u0645", "License & premium"), icon: KeyRound },
		...(isOwner ? [mailTab] : []),
		{ id: "system", label: L("\u0633\u06cc\u0633\u062a\u0645", "System"), icon: Settings2 },
		...(isOwner ? [alertsTab] : []),
		{ id: "tools", label: L("\u0639\u06cc\u0628\u200c\u06cc\u0627\u0628\u06cc", "Diagnostics"), icon: Stethoscope },
	]

	return (
		<div className="space-y-6 fade-up">
			<PageHeader
				title={t("set_title")}
				subtitle={L(
					"\u062d\u0633\u0627\u0628\u060c \u0627\u0645\u0646\u06cc\u062a\u060c \u0646\u0634\u0633\u062a\u060c \u0628\u0631\u0646\u062f\u06cc\u0646\u06af\u060c \u0638\u0627\u0647\u0631\u060c \u0644\u0627\u06cc\u0633\u0646\u0633\u060c \u0627\u06cc\u0645\u06cc\u0644\u060c \u0633\u06cc\u0633\u062a\u0645\u060c \u0647\u0634\u062f\u0627\u0631\u0647\u0627 \u0648 \u0639\u06cc\u0628\u200c\u06cc\u0627\u0628\u06cc",
					"Account, security, session, branding, appearance, license, email, system, alerts and diagnostics",
				)}
				actions={
					<>
						<Badge tone={isOwner ? "violet" : "cyan"}>{isOwner ? t("owner") : t("admin")}</Badge>
						<Badge tone={totpOn ? "success" : "warning"}>{totpOn ? L("\u062f\u0648 \u0645\u0631\u062d\u0644\u0647\u200c\u0627\u06cc \u0641\u0639\u0627\u0644", "2FA on") : L("\u062f\u0648 \u0645\u0631\u062d\u0644\u0647\u200c\u0627\u06cc \u062e\u0627\u0645\u0648\u0634", "2FA off")}</Badge>
						<Badge tone="muted">{info.version}</Badge>
					</>
				}
			/>
			<Tabs items={tabs} value={tab} onChange={setTab} />

			{tab === "account" && <AccountTab me={me} brand={brand} totpOn={totpOn} />}
			{tab === "security" && <SecurityTab me={me} totpOn={totpOn} onTotp={setTotpOn} />}
			{tab === "session" && <SessionTab />}
			{tab === "brand" && <BrandTab brand={brand} onChange={setBrand} />}
			{tab === "appearance" && <AppearanceTab brand={brand} />}
			{tab === "license" && <LicenseTab />}
			{tab === "mail" && isOwner && <MailTab />}
			{tab === "system" && <SystemTab me={me} info={info} />}
			{tab === "alerts" && isOwner && <AlertsTab />}
			{tab === "tools" && <ToolsTab info={info} />}
		</div>
	)
}
