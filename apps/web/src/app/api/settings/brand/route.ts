import { prisma } from "@srpanel/db"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { brandSchema } from "@/lib/schemas"

/** Each admin has their own brand (shown on their customers' subscription pages); owner brand is the global default. */
export const GET = route(async () => {
	const admin = await requireAdmin()
	const brand = await prisma.brand.findUnique({ where: { adminId: admin.id } })
	return ok(brand ?? { name: process.env.SRP_BRAND_NAME || "SRPanel", tagline: null, logoUrl: null, primaryColor: "#8b5cf6", accentColor: "#22d3ee", supportUrl: null, telegramUrl: null })
})

export const PUT = route(async (req) => {
	const admin = await requireAdmin()
	const body = await parseBody(req, brandSchema)
	const brand = await prisma.brand.upsert({
		where: { adminId: admin.id },
		create: { adminId: admin.id, ...body },
		update: body,
	})
	return ok(brand)
})
