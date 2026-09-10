import { prisma } from "@srpanel/db"
import { ensureStoreSettings, jsonSafe, toStoreSettingsDto } from "@srpanel/core"
import { requireAdmin } from "@/lib/auth"
import { StoreClient } from "./StoreClient"

export const dynamic = "force-dynamic"

export default async function StorePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
	const me = await requireAdmin()
	const { tab } = await searchParams
	const [s, brand] = await Promise.all([ensureStoreSettings(me), prisma.brand.findUnique({ where: { adminId: me.id } })])
	const settings = toStoreSettingsDto(s, brand?.customDomain ?? null)
	return <StoreClient settings={jsonSafe(settings) as never} isOwner={me.role === "OWNER"} initialTab={tab} />
}
