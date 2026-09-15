import { getClientTypeSettings, saveClientTypes } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

/** Every field is optional: the owner panel sends only what it changed. 0 = no cap. */
const kindAccessInput = z.object({
	limited: z.boolean().optional(),
	unlimited: z.boolean().optional(),
	unlimitedMax: z.number().int().min(0).max(100000).optional(),
	limitedMaxGB: z.number().int().min(0).max(1000000).optional(),
})
const clientTypesInput = z.object({
	defaultLimited: z.boolean().optional(),
	defaultUnlimited: z.boolean().optional(),
	defaultUnlimitedMax: z.number().int().min(0).max(100000).optional(),
	defaultLimitedMaxGB: z.number().int().min(0).max(1000000).optional(),
	admins: z.record(z.string(), kindAccessInput).optional(),
	services: z.record(z.string(), z.enum(["BOTH", "LIMITED", "UNLIMITED"])).optional(),
})

export const GET = route(async () => {
	await requireOwner()
	return ok({ settings: await getClientTypeSettings() })
})

export const PUT = route(async (req) => {
	await requireOwner()
	const body = await parseBody(req, clientTypesInput)
	return ok({ settings: await saveClientTypes(body) })
})
