import { cookies } from "next/headers"
import { z } from "zod"
import { changeOwnPassword, getSecuritySettings, revokeOtherSessions } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { SESSION_COOKIE, requireAdmin } from "@/lib/auth"

const schema = z.object({ current: z.string().min(1), next: z.string().min(8).max(256) })

export const POST = route(async (req) => {
	const admin = await requireAdmin()
	const { current, next } = await parseBody(req, schema)
	await changeOwnPassword(admin, current, next)

	// a changed password must not leave old browsers signed in; this tab keeps working
	let revoked = 0
	const policy = await getSecuritySettings()
	if (policy.revokeOnPasswordChange) {
		const token = (await cookies()).get(SESSION_COOKIE)?.value
		revoked = await revokeOtherSessions(admin.id, token)
	}
	return ok({ ok: true, revoked })
})
