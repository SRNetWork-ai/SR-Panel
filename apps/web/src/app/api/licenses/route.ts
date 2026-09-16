import {
	AppError,
	LICENSE_FEATURES,
	LICENSE_FEATURE_LABELS,
	activateLicense,
	assertVendor,
	createLicenses,
	deleteLicense,
	dropLicense,
	listLicenses,
	panelEntitlements,
	recheckLicense,
	releaseLicense,
	setLicenseRevoked,
} from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin, requireOwner } from "@/lib/auth"

const postSchema = z.object({
	/** activate a 12-character code for the whole install */
	activate: z.string().trim().min(8).max(40).optional(),
	refresh: z.boolean().optional(),
	clear: z.boolean().optional(),
	/** vendor side only: mint new codes */
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

/**
 * Every admin sees what this install is entitled to. The minted-code list only
 * exists on the vendor panel: a customer install has nothing to show here.
 */
export const GET = route(async () => {
	const me = await requireAdmin()
	const isOwner = me.role === "OWNER"
	const panel = await panelEntitlements()
	return ok({
		isOwner,
		vendor: panel.vendor,
		panel,
		features: LICENSE_FEATURES.map((id) => ({ id, label: LICENSE_FEATURE_LABELS[id] })),
		licenses: panel.vendor && isOwner ? await listLicenses() : [],
	})
})

export const POST = route(async (req) => {
	const me = await requireOwner()
	const body = await parseBody(req, postSchema)
	// install side: activate / re-check / remove the code of this panel
	if (body.activate) return ok({ panel: await activateLicense(me, body.activate) })
	if (body.refresh) return ok({ panel: await recheckLicense(me) })
	if (body.clear) return ok({ panel: await dropLicense(me) })
	// vendor side: minting and code management never work on a customer install
	if (body.create) {
		assertVendor()
		return ok({ created: await createLicenses(me, body.create) })
	}
	if (body.code && body.remove) {
		assertVendor()
		return ok(await deleteLicense(me, body.code))
	}
	if (body.code && body.release) {
		assertVendor()
		return ok({ license: await releaseLicense(me, body.code) })
	}
	if (body.code && body.revoked !== undefined) {
		assertVendor()
		return ok({ license: await setLicenseRevoked(me, body.code, body.revoked) })
	}
	throw new AppError("\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0646\u0627\u0645\u0639\u062a\u0628\u0631 \u0627\u0633\u062a")
})
