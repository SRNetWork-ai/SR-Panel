import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { prisma } from "@srpanel/db"
import { LICENSE_FEATURES, LICENSE_FEATURE_LABELS, panelEntitlements } from "@srpanel/core"
import { AppShell } from "@/components/AppShell"
import { PremiumNotice } from "@/components/PremiumNotice"
import { currentAdmin, currentTheme } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function AppLayout({ children }: { children: ReactNode }) {
	const admin = await currentAdmin()
	if (!admin) redirect("/login")
	const [theme, brand, ent] = await Promise.all([
		currentTheme(),
		prisma.brand.findUnique({ where: { adminId: admin.id }, select: { name: true } }),
		panelEntitlements(),
	])
	const missing = ent.vendor ? [] : LICENSE_FEATURES.filter((f) => !ent.features.includes(f)).map((f) => LICENSE_FEATURE_LABELS[f])
	return (
		<AppShell
			user={{ username: admin.username, displayName: admin.displayName, role: admin.role }}
			brandName={brand?.name || process.env.SRP_BRAND_NAME || "SRPanel"}
			theme={theme}
		>
			<PremiumNotice locked={ent.locked} missing={missing} />
			{children}
		</AppShell>
	)
}
