import { ensureSmsToken, rotateSmsToken, webhookUrlFor } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

const bodySchema = z.object({ rotate: z.boolean().optional() })

/** Creates (or rotates) the private URL that an SMS-forwarder app posts deposits to. */
export const POST = route(async (req) => {
	const me = await requireAdmin()
	const { rotate } = await parseBody(req, bodySchema)
	const token = rotate ? await rotateSmsToken(me.id) : await ensureSmsToken(me.id)
	return ok({ token, webhookUrl: webhookUrlFor(token) })
})
