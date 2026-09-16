import { removeStoreDomain, setStoreDomain, storeDomainStatus, verifyStoreDomain } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

/** Each admin manages their own shop domain; the premium gate lives in lib/premium.ts. */
const hostSchema = z.object({ host: z.string().min(4).max(190) })
const actionSchema = z.object({ action: z.enum(["verify"]) })

export const GET = route(async () => {
	const admin = await requireAdmin()
	return ok(await storeDomainStatus(admin))
})

export const PUT = route(async (req) => {
	const admin = await requireAdmin()
	const body = await parseBody(req, hostSchema)
	return ok(await setStoreDomain(admin, body.host))
})

export const POST = route(async (req) => {
	const admin = await requireAdmin()
	await parseBody(req, actionSchema)
	return ok(await verifyStoreDomain(admin))
})

export const DELETE = route(async () => {
	const admin = await requireAdmin()
	return ok(await removeStoreDomain(admin))
})
