"use client"

import { useState } from "react"
import { Palette, Settings2, ShieldCheck, Sparkles, Stethoscope, UserCircle2 } from "lucide-react"
import type { AdminDto } from "@/lib/dto"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, PageHeader } from "@/components/ui"
import { Tabs, type TabItem } from "@/components/parts"
import { AccountTab } from "./AccountTab"
import { AppearanceTab } from "./AppearanceTab"
import { BrandTab } from "./BrandTab"
import { SecurityTab } from "./SecurityTab"
import { SystemTab } from "./SystemTab"
import { ToolsTab } from "./ToolsTab"
import { tr, type Brand, type SystemInfo, type Tab } from "./types"

export type { SystemInfo } from "./types"

export function SettingsClient({ me, brand: initialBrand, info }: { me: AdminDto; brand: Brand; info: SystemInfo }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const isOwner = me.role === "OWNER"
	const [tab, setTab] = useState<Tab>("account")
	const [brand, setBrand] = useState<Brand>(initialBrand)
	const [totpOn, setTotpOn] = useState(me.totpEnabled)

	const tabs: Array<TabItem<Tab>> = [
		{ id: "account", label: t("set_account"), icon: UserCircle2 },
		{ id: "security", label: L("امنیت", "Security"), icon: ShieldCheck, badge: totpOn ? "2FA" : undefined },
		{ id: "brand", label: t("set_brand"), icon: Palette },
		{ id: "appearance", label: t("set_appearance"), icon: Sparkles },
		{ id: "system", label: L("سیستم", "System"), icon: Settings2 },
		{ id: "tools", label: L("عیب‌یابی", "Diagnostics"), icon: Stethoscope },
	]

	return (
		<div className="space-y-6 fade-up">
			<PageHeader
				title={t("set_title")}
				subtitle={L("حساب، امنیت، برندینگ، ظاهر، سیستم و عیب‌یابی", "Account, security, branding, appearance, system and diagnostics")}
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
			{tab === "brand" && <BrandTab brand={brand} onChange={setBrand} />}
			{tab === "appearance" && <AppearanceTab brand={brand} />}
			{tab === "system" && <SystemTab me={me} info={info} />}
			{tab === "tools" && <ToolsTab info={info} />}
		</div>
	)
}
