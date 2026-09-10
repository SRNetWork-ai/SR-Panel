import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { prisma } from "@srpanel/db"
import { AppShell } from "@/components/AppShell"
import { currentAdmin, currentTheme } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function AppLayout({ children }: { children: ReactNode }) {
	const admin = await currentAdmin()
	if (!admin) redirect("/login")
	const [theme, brand] = await Promise.all([
		currentTheme(),
		prisma.brand.findUnique({ where: { adminId: admin.id }, select: { name: true } }),
	])
	return (
		<AppShell
			user={{ username: admin.username, displayName: admin.displayName, role: admin.role }}
			brandName={brand?.name || process.env.SRP_BRAND_NAME || "SRPanel"}
			theme={theme}
		>
			{children}
		</AppShell>
	)
}
