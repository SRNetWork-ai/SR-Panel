import { z } from "zod"
import { beginTotpSetup, confirmTotp, disableTotp } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

/** POST { action: "begin" } -> { secret, url } ; { action: "confirm", code } ; { action: "disable", code } */
const schema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("begin") }),
	z.object({ action: z.literal("confirm"), code: z.string().regex(/^\d{6}$/) }),
	z.object({ action: z.literal("disable"), code: z.string().regex(/^\d{6}$/) }),
])

export const POST = route(async (req) => {
	const admin = await requireAdmin()
	const body = await parseBody(req, schema)
	if (body.action === "begin") return ok(await beginTotpSetup(admin))
	if (body.action === "confirm") {
		await confirmTotp(admin, body.code)
		return ok({ ok: true, enabled: true })
	}
	await disableTotp(admin, body.code)
	return ok({ ok: true, enabled: false })
})
