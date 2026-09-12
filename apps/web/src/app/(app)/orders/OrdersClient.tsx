"use client"

import { useState } from "react"
import { CreditCard, ShoppingCart } from "lucide-react"
import { useT } from "@/lib/i18n"
import { PageHeader, Tabs } from "@/components/ui"
import { OrdersTab } from "./OrdersTab"
import { PaymentsTab } from "./PaymentsTab"

type Tab = "orders" | "payments"

export function OrdersClient({ isOwner, pendingReview }: { isOwner: boolean; pendingReview: number }) {
	const t = useT()
	const [tab, setTab] = useState<Tab>(pendingReview > 0 ? "payments" : "orders")
	const [refreshKey, setRefreshKey] = useState(0)

	return (
		<div className="space-y-6 fade-up">
			<PageHeader title={t("ord_title_page")} subtitle={t("ord_sub")} />
			<Tabs<Tab>
				value={tab}
				onChange={setTab}
				tabs={[
					{ id: "orders", label: t("ord_tab_orders"), icon: <ShoppingCart className="h-4 w-4" /> },
					{ id: "payments", label: t("ord_tab_payments"), icon: <CreditCard className="h-4 w-4" />, count: pendingReview },
				]}
			/>
			{tab === "orders" ? (
				<OrdersTab isOwner={isOwner} refreshKey={refreshKey} />
			) : (
				<PaymentsTab isOwner={isOwner} onChanged={() => setRefreshKey((k) => k + 1)} />
			)}
		</div>
	)
}
