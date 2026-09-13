import { setCustomerStatus } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route, zId } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

const statusSchema = z.object({ status: z.enum(["ACTIVE", "BLOCKED"]) })

export const POST = route<{ id: string }>(async (req, ctx) => {
	const me = await requireAdmin()
	const { id } = await ctx.params
	const { status } = await parseBody(req, statusSchema)
	return ok(await setCustomerStatus(me, zId.parse(id), status))
})
