import { z } from "zod"
import { changeOwnPassword } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

const schema = z.object({ current: z.string().min(1), next: z.string().min(8).max(256) })

export const POST = route(async (req) => {
	const admin = await requireAdmin()
	const { current, next } = await parseBody(req, schema)
	await changeOwnPassword(admin, current, next)
	return ok({ ok: true })
})
