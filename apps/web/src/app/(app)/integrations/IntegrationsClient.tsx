"use client"

import { useState } from "react"
import { Bell, Bot, KeyRound, Webhook as WebhookIcon } from "lucide-react"
import type { AdminDto } from "@/lib/dto"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, PageHeader, cx } from "@/components/ui"
import { ApiKeysTab } from "./ApiKeysTab"
import { NotificationsTab } from "./NotificationsTab"
import { TelegramTab } from "./TelegramTab"
import { WebhooksTab } from "./WebhooksTab"
import { tr, type Tab, type TelegramForm } from "./types"

export type { TelegramForm } from "./types"

export function IntegrationsClient({ me, telegram }: { me: AdminDto; telegram: TelegramForm | null }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const isOwner = me.role === "OWNER"

	const allTabs: Array<{ id: Tab; label: string; hint: string; icon: typeof Bot; owner?: boolean }> = [
		{ id: "telegram", label: t("int_tab_telegram"), hint: L("ربات، اعلان‌ها و دستورهای تلگرام", "Telegram bot, alerts and commands"), icon: Bot, owner: true },
		{ id: "apikeys", label: t("int_tab_apikeys"), hint: L("دسترسی برنامه‌نویسی به API نسخهٔ ۱", "Programmatic access to API v1"), icon: KeyRound },
		{ id: "webhooks", label: t("int_tab_webhooks"), hint: L("ارسال رویدادهای پنل به سرویس شما", "Push panel events to your service"), icon: WebhookIcon },
		{ id: "notifications", label: t("int_tab_notifications"), hint: L("تاریخچهٔ ارسال اعلان‌ها", "Notification delivery history"), icon: Bell, owner: true },
	]
	const tabs = allTabs.filter((x) => isOwner || !x.owner)
	const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? "apikeys")
	const current = tabs.find((x) => x.id === tab) ?? tabs[0]

	return (
		<div className="fade-up space-y-6">
			<PageHeader title={t("int_title")} subtitle={t("int_sub")} />

			<div className="space-y-2">
				<div className="glass flex flex-wrap gap-1 rounded-2xl p-1.5">
					{tabs.map((x) => (
						<button
							key={x.id}
							type="button"
							onClick={() => setTab(x.id)}
							className={cx(
								"flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition",
								tab === x.id ? "neon-ring bg-violet/20 text-fg" : "text-muted hover:text-fg",
							)}
						>
							<x.icon className="h-4 w-4" /> {x.label}
							{x.owner && <Badge tone="muted">{t("owner")}</Badge>}
						</button>
					))}
				</div>
				{current && <p className="px-1 text-xs text-muted">{current.hint}</p>}
			</div>

			{tab === "telegram" && telegram && <TelegramTab initial={telegram} />}
			{tab === "apikeys" && <ApiKeysTab />}
			{tab === "webhooks" && <WebhooksTab />}
			{tab === "notifications" && <NotificationsTab />}
		</div>
	)
}
