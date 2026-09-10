import { cookies } from "next/headers"
import { revokeSession } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { SESSION_COOKIE } from "@/lib/auth"

export const POST = route(async () => {
	const store = await cookies()
	const token = store.get(SESSION_COOKIE)?.value
	if (token) await revokeSession(token).catch(() => undefined)
	store.delete(SESSION_COOKIE)
	return ok({ ok: true })
})
