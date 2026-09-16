import {
	AppError,
	LICENSE_FEATURES,
	LICENSE_FEATURE_LABELS,
	activatePanelLicense,
	clearPanelLicense,
	createLicenses,
	deleteLicense,
	listLicenses,
	panelLicenseDto,
	refreshPanelLicense,
	releaseLicense,
	setLicenseRevoked,
	setLicensingEnforced,
} from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin, requireOwner } from "@/lib/auth"

const putSchema = z.object({ enforced: z.boolean() })

const postSchema = z.object({
	/** activate a 12-character code for the whole install */
	activate: z.string().trim().min(8).max(40).optional(),
	refresh: z.boolean().optional(),
	clear: z.boolean().optional(),
	/** vendor side: mint new codes */
	create: z
		.object({
			count: z.number().int().min(1).max(50).optional(),
			plan: z.enum(["FREE", "PLUS", "PRO"]).optional(),
			features: z.array(z.string()).optional(),
			days: z.number().int().min(0).max(3650).optional(),
			note: z.string().max(200).optional(),
		})
		.optional(),
	code: z.string().trim().min(8).max(40).optional(),
	revoked: z.boolean().optional(),
	release: z.boolean().optional(),
	remove: z.boolean().optional(),
})

/** Every admin sees the install license; only the owner sees the minted codes. */
export const GET = route(async () => {
	const me = await requireAdmin()
	const isOwner = me.role === "OWNER"
	return ok({
		isOwner,
		panel: await panelLicenseDto(),
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
	const me = await requireOwner()
	const body = await parseBody(req, postSchema)
	if (body.activate) return ok({ panel: await activatePanelLicense(me, body.activate) })
	if (body.refresh) return ok({ panel: await refreshPanelLicense(me) })
	if (body.clear) return ok({ panel: await clearPanelLicense(me) })
	if (body.create) return ok({ created: await createLicenses(me, body.create) })
	if (body.code && body.remove) return ok(await deleteLicense(me, body.code))
	if (body.code && body.release) return ok({ license: await releaseLicense(me, body.code) })
	if (body.code && body.revoked !== undefined) return ok({ license: await setLicenseRevoked(me, body.code, body.revoked) })
	throw new AppError("درخواست نامعتبر است")
})
