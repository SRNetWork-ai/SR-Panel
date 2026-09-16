import {
	AppError,
	LICENSE_FEATURES,
	LICENSE_FEATURE_LABELS,
	activateLicense,
	createLicenses,
	deleteLicense,
	entitlementsFrom,
	getLicensing,
	listLicenses,
	releaseLicense,
	setLicenseRevoked,
	setLicensingEnforced,
} from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin, requireOwner } from "@/lib/auth"

const putSchema = z.object({ enforced: z.boolean() })

const postSchema = z.object({
	activate: z.string().trim().min(4).max(64).optional(),
	create: z
		.object({
			count: z.number().int().min(1).max(50).optional(),
			plan: z.enum(["FREE", "PLUS", "PRO"]).optional(),
			features: z.array(z.string()).optional(),
			days: z.number().int().min(0).max(3650).optional(),
			note: z.string().max(200).optional(),
		})
		.optional(),
	code: z.string().trim().min(4).max(64).optional(),
	revoked: z.boolean().optional(),
	release: z.boolean().optional(),
	remove: z.boolean().optional(),
})

/** Own entitlements for every admin; the whole key list for the owner. */
export const GET = route(async () => {
	const me = await requireAdmin()
	const cfg = await getLicensing()
	const isOwner = me.role === "OWNER"
	return ok({
		isOwner,
		enforced: cfg.enforced,
		mine: entitlementsFrom(cfg, me),
		features: LICENSE_FEATURES.map((id) => ({ id, label: LICENSE_FEATURE_LABELS[id] })),
		licenses: isOwner ? await listLicenses() : [],
	})
})

export const PUT = route(async (req) => {
	const me = await requireOwner()
	const body = await parseBody(req, putSchema)
	const cfg = await setLicensingEnforced(me, body.enforced)
	return ok({ enforced: cfg.enforced })
})

export const POST = route(async (req) => {
	const me = await requireAdmin()
	const body = await parseBody(req, postSchema)
	if (body.activate) return ok({ license: await activateLicense(me, body.activate) })
	if (body.create) return ok({ created: await createLicenses(me, body.create) })
	if (body.code && body.remove) return ok(await deleteLicense(me, body.code))
	if (body.code && body.release) return ok({ license: await releaseLicense(me, body.code) })
	if (body.code && body.revoked !== undefined) return ok({ license: await setLicenseRevoked(me, body.code, body.revoked) })
	throw new AppError("درخواست نامعتبر است")
})
