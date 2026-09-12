"use client"

import { useState, type ReactNode } from "react"
import { CreditCard, ExternalLink, LayoutGrid, Package, Percent, Settings2 } from "lucide-react"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, PageHeader, Tabs } from "@/components/ui"
import { DiscountsTab } from "./DiscountsTab"
import { OverviewTab } from "./OverviewTab"
import { PaymentsTab } from "./PaymentsTab"
import { PlansTab } from "./PlansTab"
import { SettingsTab } from "./SettingsTab"
import { tr, type StoreSettings, type Tab } from "./types"

export function StoreClient({ settings, isOwner, initialTab }: { settings: StoreSettings; isOwner: boolean; initialTab?: string }) {
	const t = useT()
	const locale = useLocale()
	const tabs: Array<{ id: Tab; label: string; icon: ReactNode }> = [
		{ id: "overview", label: t("store_tab_overview"), icon: <LayoutGrid className="h-4 w-4" /> },
		{ id: "plans", label: t("store_tab_plans"), icon: <Package className="h-4 w-4" /> },
		{ id: "payments", label: tr(locale, "پرداخت‌ها", "Payments"), icon: <CreditCard className="h-4 w-4" /> },
		{ id: "discounts", label: t("store_tab_discounts"), icon: <Percent className="h-4 w-4" /> },
		{ id: "settings", label: t("store_tab_settings"), icon: <Settings2 className="h-4 w-4" /> },
	]
	const [tab, setTab] = useState<Tab>(tabs.some((x) => x.id === initialTab) ? (initialTab as Tab) : "overview")

	return (
		<div className="space-y-6 fade-up">
			<PageHeader
				title={t("store_title_page")}
				subtitle={t("store_sub")}
				actions={
					<>
						<Badge tone={settings.enabled ? "success" : "muted"}>{settings.enabled ? t("active") : t("inactive")}</Badge>
						<a className="btn btn-sm" href={settings.url} target="_blank" rel="noreferrer">
							<ExternalLink className="h-4 w-4" /> {t("store_link")}
						</a>
					</>
				}
			/>
			<Tabs tabs={tabs} value={tab} onChange={setTab} />
			{tab === "overview" && <OverviewTab onGoto={setTab} />}
			{tab === "plans" && <PlansTab isOwner={isOwner} />}
			{tab === "payments" && <PaymentsTab initial={settings} />}
			{tab === "discounts" && <DiscountsTab />}
			{tab === "settings" && <SettingsTab initial={settings} />}
		</div>
	)
}
