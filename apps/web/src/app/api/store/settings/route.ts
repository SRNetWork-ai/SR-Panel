import { ensureStoreSettings, storeSettingsInput, toStoreSettingsDto, updateStoreSettings } from "@srpanel/core"
import { prisma } from "@srpanel/db"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

export const GET = route(async () => {
	const me = await requireAdmin()
	const [s, brand] = await Promise.all([ensureStoreSettings(me), prisma.brand.findUnique({ where: { adminId: me.id } })])
	return ok(toStoreSettingsDto(s, brand?.customDomain))
})

export const PUT = route(async (req) => {
	const me = await requireAdmin()
	const body = await parseBody(req, storeSettingsInput)
	const s = await updateStoreSettings(me, body)
	const brand = await prisma.brand.findUnique({ where: { adminId: me.id } })
	return ok(toStoreSettingsDto(s, brand?.customDomain))
})
