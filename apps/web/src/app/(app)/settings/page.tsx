import { panelVersion } from "@srpanel/core"
import { prisma } from "@srpanel/db"
import { requireAdmin } from "@/lib/auth"
import { toAdminDto } from "@/lib/dto"
import { SettingsClient } from "./SettingsClient"
import type { Tab } from "./types"

export const dynamic = "force-dynamic"

/** /settings?tab=alerts deep links straight into a tab */
const TABS: Tab[] = ["account", "security", "session", "brand", "appearance", "system", "alerts", "tools"]

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const admin = await requireAdmin()
	const [brand, version, sp] = await Promise.all([prisma.brand.findUnique({ where: { adminId: admin.id } }), panelVersion(), searchParams])
	const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab
	return (
		<SettingsClient
			me={toAdminDto(admin)}
			initialTab={TABS.find((x) => x === raw)}
			brand={{
				name: brand?.name ?? (process.env.SRP_BRAND_NAME || "SRPanel"),
				tagline: brand?.tagline ?? "",
				logoUrl: brand?.logoUrl ?? "",
				primaryColor: brand?.primaryColor ?? "#8b5cf6",
				accentColor: brand?.accentColor ?? "#22d3ee",
				supportUrl: brand?.supportUrl ?? "",
				telegramUrl: brand?.telegramUrl ?? "",
			}}
			info={{
				version,
				publicUrl: process.env.SRP_PUBLIC_URL || "",
				tz: process.env.TZ || "UTC",
				agentHint: admin.role === "OWNER",
			}}
		/>
	)
}
