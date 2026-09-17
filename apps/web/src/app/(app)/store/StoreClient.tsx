"use client"

import { useState, type ReactNode } from "react"
import { CreditCard, ExternalLink, Layers, LayoutGrid, Package, Percent, Settings2, Store, Users } from "lucide-react"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, PageHeader, Tabs } from "@/components/ui"
import { CatalogTab } from "./CatalogTab"
import { CustomersTab } from "./CustomersTab"
import { DiscountsTab } from "./DiscountsTab"
import { OverviewTab } from "./OverviewTab"
import { PanelPlansTab } from "./PanelPlansTab"
import { PaymentsTab } from "./PaymentsTab"
import { PlansTab } from "./PlansTab"
import { SettingsTab } from "./SettingsTab"
import { tr, type StoreSettings, type Tab } from "./types"

/* the shared-panel tab is local to this screen, so the shared Tab union stays untouched */
type ShopTab = Tab | "panels"

export function StoreClient({ settings, isOwner, initialTab }: { settings: StoreSettings; isOwner: boolean; initialTab?: string }) {
	const t = useT()
	const locale = useLocale()
	const tabs: Array<{ id: ShopTab; label: string; icon: ReactNode }> = [
		{ id: "overview", label: t("store_tab_overview"), icon: <LayoutGrid className="h-4 w-4" /> },
		{ id: "plans", label: t("store_tab_plans"), icon: <Package className="h-4 w-4" /> },
		{ id: "catalog", label: tr(locale, "دسته‌بندی و آپشن‌ها", "Categories & options"), icon: <Layers className="h-4 w-4" /> },
		{ id: "payments", label: tr(locale, "پرداخت‌ها", "Payments"), icon: <CreditCard className="h-4 w-4" /> },
		{ id: "customers", label: tr(locale, "مشتریان", "Customers"), icon: <Users className="h-4 w-4" /> },
		{ id: "panels", label: tr(locale, "پنل اشتراکی", "Shared panels"), icon: <Store className="h-4 w-4" /> },
		{ id: "discounts", label: t("store_tab_discounts"), icon: <Percent className="h-4 w-4" /> },
		{ id: "settings", label: t("store_tab_settings"), icon: <Settings2 className="h-4 w-4" /> },
	]
	const [tab, setTab] = useState<ShopTab>(tabs.some((x) => x.id === initialTab) ? (initialTab as ShopTab) : "overview")

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
			{tab === "catalog" && <CatalogTab />}
			{tab === "payments" && <PaymentsTab initial={settings} />}
			{tab === "customers" && <CustomersTab />}
			{tab === "panels" && <PanelPlansTab />}
			{tab === "discounts" && <DiscountsTab />}
			{tab === "settings" && <SettingsTab initial={settings} />}
		</div>
	)
}
