import { resetCustomerPassword } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route, zId } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

const passwordSchema = z.object({ password: z.string().min(6, "رمز عبور باید حداقل ۶ کاراکتر باشد").max(72) })

/** Seller-side password reset; all customer sessions are dropped. */
export const POST = route<{ id: string }>(async (req, ctx) => {
	const me = await requireAdmin()
	const { id } = await ctx.params
	const { password } = await parseBody(req, passwordSchema)
	await resetCustomerPassword(me, zId.parse(id), password)
	return ok({ ok: true })
})
