import { z } from "zod"
import { bulkAdminAction } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { toAdminDto } from "@/lib/dto"

const bulkBody = z.object({
	ids: z.array(z.string().min(1)).min(1).max(100),
	action: z.enum(["activate", "deactivate", "extend", "quota", "clientLimit"]),
	days: z.number().int().min(-3650).max(3650).optional(),
	quotaGB: z.number().min(0).max(1_048_576).nullable().optional(),
	clientLimit: z.number().int().min(0).max(100_000).nullable().optional(),
})

export const POST = route(async (req) => {
	const owner = await requireOwner()
	const body = await parseBody(req, bulkBody)
	const result = await bulkAdminAction(owner, body)
	return ok({ total: result.total, updated: result.updated, skipped: result.skipped, admins: result.admins.map((a) => toAdminDto(a as any)) })
})
