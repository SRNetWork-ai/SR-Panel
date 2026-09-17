import { createPaymentPlugin, deletePaymentPlugin, listPaymentPlugins, paymentPluginInput, rotatePaymentPluginSecret, updatePaymentPlugin } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

/** Every admin manages their own payment plugins; the premium gate lives in lib/premium.ts. */
const idSchema = z.object({ id: z.string().min(4) })
const patchSchema = paymentPluginInput.partial().extend({ id: z.string().min(4) })

export const GET = route(async () => {
	const admin = await requireAdmin()
	return ok({ plugins: await listPaymentPlugins(admin) })
})

/** The signing secret is returned exactly once, right here. */
export const POST = route(async (req) => {
	const admin = await requireAdmin()
	const body = await parseBody(req, paymentPluginInput)
	return ok(await createPaymentPlugin(admin, body))
})

export const PUT = route(async (req) => {
	const admin = await requireAdmin()
	const { id, ...patch } = await parseBody(req, patchSchema)
	return ok({ plugin: await updatePaymentPlugin(admin, id, patch) })
})

/** Rotate: the old secret stops working immediately. */
export const PATCH = route(async (req) => {
	const admin = await requireAdmin()
	const { id } = await parseBody(req, idSchema)
	return ok(await rotatePaymentPluginSecret(admin, id))
})

export const DELETE = route(async (req) => {
	const admin = await requireAdmin()
	return ok(await deletePaymentPlugin(admin, req.nextUrl.searchParams.get("id") ?? ""))
})
