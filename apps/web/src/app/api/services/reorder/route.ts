import { z } from "zod"
import { reorderServices } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

const reorderBody = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) })

export const POST = route(async (req) => {
	const owner = await requireOwner()
	const { ids } = await parseBody(req, reorderBody)
	return ok({ order: await reorderServices(owner, ids) })
})
