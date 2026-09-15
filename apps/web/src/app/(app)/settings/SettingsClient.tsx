"use client"

import { useState } from "react"
import { Bell, Clock, KeyRound, Palette, Settings2, ShieldCheck, Sparkles, Stethoscope, UserCircle2 } from "lucide-react"
import type { AdminDto } from "@/lib/dto"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, PageHeader } from "@/components/ui"
import { Tabs, type TabItem } from "@/components/parts"
import { AccountTab } from "./AccountTab"
import { AlertsTab } from "./AlertsTab"
import { AppearanceTab } from "./AppearanceTab"
import { BrandTab } from "./BrandTab"
import { LicenseTab } from "./LicenseTab"
import { SecurityTab } from "./SecurityTab"
import { SessionTab } from "./SessionTab"
import { SystemTab } from "./SystemTab"
import { ToolsTab } from "./ToolsTab"
import { tr, type Brand, type SystemInfo, type Tab } from "./types"

export type { SystemInfo } from "./types"

/** «license» lives only in this screen, so it stays out of the deep-link Tab union. */
type LocalTab = Tab | "license"

export function SettingsClient({ me, brand: initialBrand, info, initialTab }: { me: AdminDto; brand: Brand; info: SystemInfo; initialTab?: Tab }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const isOwner = me.role === "OWNER"
	const allowed = initialTab && (initialTab !== "alerts" || isOwner) ? initialTab : "account"
	const [tab, setTab] = useState<LocalTab>(allowed)
	const [brand, setBrand] = useState<Brand>(initialBrand)
	const [totpOn, setTotpOn] = useState(me.totpEnabled)

	const alertsTab: TabItem<LocalTab> = { id: "alerts", label: L("هشدار و سیاست‌ها", "Alerts & policies"), icon: Bell }

	const tabs: Array<TabItem<LocalTab>> = [
		{ id: "account", label: t("set_account"), icon: UserCircle2 },
		{ id: "security", label: L("امنیت", "Security"), icon: ShieldCheck, badge: totpOn ? "2FA" : undefined },
		{ id: "session", label: L("نشست و قفل خودکار", "Session & lock"), icon: Clock },
		{ id: "brand", label: t("set_brand"), icon: Palette },
		{ id: "appearance", label: t("set_appearance"), icon: Sparkles },
		{ id: "license", label: L("لایسنس و پرمیوم", "License & premium"), icon: KeyRound },
		{ id: "system", label: L("سیستم", "System"), icon: Settings2 },
		...(isOwner ? [alertsTab] : []),
		{ id: "tools", label: L("عیب‌یابی", "Diagnostics"), icon: Stethoscope },
	]

	return (
		<div className="space-y-6 fade-up">
			<PageHeader
				title={t("set_title")}
				subtitle={L("حساب، امنیت، نشست، برندینگ، ظاهر، لایسنس، سیستم، هشدارها و عیب‌یابی", "Account, security, session, branding, appearance, license, system, alerts and diagnostics")}
				actions={
					<>
						<Badge tone={isOwner ? "violet" : "cyan"}>{isOwner ? t("owner") : t("admin")}</Badge>
						<Badge tone={totpOn ? "success" : "warning"}>{totpOn ? L("دو مرحله‌ای فعال", "2FA on") : L("دو مرحله‌ای خاموش", "2FA off")}</Badge>
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
			{tab === "system" && <SystemTab me={me} info={info} />}
			{tab === "alerts" && isOwner && <AlertsTab />}
			{tab === "tools" && <ToolsTab info={info} />}
		</div>
	)
}
