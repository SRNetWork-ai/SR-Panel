import { loginCodeRequired, requestLoginCode } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { clientIp } from "@/lib/auth"

const schema = z.object({
	username: z.string().min(1).max(64),
	password: z.string().min(1).max(256),
})

/**
 * Public on purpose: the password is verified inside `requestLoginCode` before a
 * single byte is mailed, so the route cannot be used to flood the inbox or to
 * probe usernames.
 */
export const POST = route(async (req) => {
	const body = await parseBody(req, schema)
	if (!(await loginCodeRequired())) return ok({ ok: false, reason: "disabled" })
	const ip = await clientIp()
	const sent = await requestLoginCode({ username: body.username, password: body.password, ip })
	return ok({ ok: true, to: sent.to, ttlMin: sent.ttlMin })
})
