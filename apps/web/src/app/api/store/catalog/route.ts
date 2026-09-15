import { saveStoreCatalog, storeCatalog, storeCatalogSchema } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

/**
 * Plan categories + extended per-plan options of the caller's storefront.
 * The whole object is Setting-backed, so the UI sends a full (or partial)
 * catalogue and gets the merged result back.
 */
const catalogPatch = storeCatalogSchema.partial()

export const GET = route(async () => {
	const me = await requireAdmin()
	return ok({ catalog: await storeCatalog(me.id) })
})

export const PUT = route(async (req) => {
	const me = await requireAdmin()
	const body = await parseBody(req, catalogPatch)
	return ok({ catalog: await saveStoreCatalog(me.id, body) })
})
