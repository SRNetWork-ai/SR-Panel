import { buyResellerPlan, getResellerPlanSettings, listResellerPlansFor, saveResellerPlans } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin, requireOwner } from "@/lib/auth"

/** Reseller packages: GET the catalogue, POST to buy one, PUT (owner) to edit it. */
const planInput = z.object({
	id: z.string().optional(),
	name: z.string().min(1),
	description: z.string().optional(),
	gb: z.number().int().min(0).optional(),
	days: z.number().int().min(0).optional(),
	clients: z.number().int().min(0).optional(),
	price: z.number().int().min(0).optional(),
	isActive: z.boolean().optional(),
	sortOrder: z.number().int().optional(),
	adminIds: z.array(z.string()).optional(),
})
const saveInput = z.object({ enabled: z.boolean().optional(), plans: z.array(planInput).optional() })
const buyInput = z.object({ planId: z.string().min(1) })

export const GET = route(async () => {
	const me = await requireAdmin()
	const settings = await getResellerPlanSettings()
	const isOwner = me.role === "OWNER"
	return ok({ isOwner, enabled: settings.enabled, plans: isOwner ? settings.plans : await listResellerPlansFor(me) })
})

export const PUT = route(async (req) => {
	await requireOwner()
	const body = await parseBody(req, saveInput)
	const settings = await saveResellerPlans(body)
	return ok({ isOwner: true, enabled: settings.enabled, plans: settings.plans })
})

export const POST = route(async (req) => {
	const me = await requireAdmin()
	const { planId } = await parseBody(req, buyInput)
	const r = await buyResellerPlan(me, planId)
	return ok({
		plan: r.plan,
		charged: Number(r.charged),
		balance: Number(r.balance),
		trafficQuota: r.trafficQuota === null ? null : Number(r.trafficQuota),
		clientLimit: r.clientLimit,
		expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
	})
})
