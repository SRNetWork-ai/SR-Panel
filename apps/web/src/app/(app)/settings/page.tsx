import { panelVersion } from "@srpanel/core"
import { prisma } from "@srpanel/db"
import { requireAdmin } from "@/lib/auth"
import { toAdminDto } from "@/lib/dto"
import { SettingsClient } from "./SettingsClient"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
	const admin = await requireAdmin()
	const [brand, version] = await Promise.all([prisma.brand.findUnique({ where: { adminId: admin.id } }), panelVersion()])
	return (
		<SettingsClient
			me={toAdminDto(admin)}
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
