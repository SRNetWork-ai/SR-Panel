import { deletePanelPlan, listPanelAccounts, listPanelPlanOptions, listPanelPlans, panelPlanLinkSchema, pendingPanelHandoffs, resetPanelAccountPassword, revealPanelHandoff, savePanelPlan } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"

/**
 * Shared panels: linking a store plan to a panel package and handing the sold
 * sub-panels over. Every admin only sees their own plans and accounts; the
 * premium gate lives in lib/premium.ts.
 */
const linkSchema = panelPlanLinkSchema.partial().extend({ planId: z.string().min(4) })
const orderSchema = z.object({ orderId: z.string().min(4) })
const accountSchema = z.object({ adminId: z.string().min(4) })

export const GET = route(async () => {
	const admin = await requireAdmin()
	const [links, plans, accounts, pending] = await Promise.all([listPanelPlans(admin), listPanelPlanOptions(admin), listPanelAccounts(admin), pendingPanelHandoffs(admin)])
	return ok({ links, plans, accounts, pending })
})

/** Link a plan or edit its package (the same call does both). */
export const PUT = route(async (req) => {
	const admin = await requireAdmin()
	const body = await parseBody(req, linkSchema)
	return ok({ link: await savePanelPlan(admin, body) })
})

/** One shot: the parked password is returned and then deleted. */
export const PATCH = route(async (req) => {
	const admin = await requireAdmin()
	const { orderId } = await parseBody(req, orderSchema)
	return ok(await revealPanelHandoff(admin, orderId))
})

/** The buyer lost the password of a sub-panel this admin sold. */
export const POST = route(async (req) => {
	const admin = await requireAdmin()
	const { adminId } = await parseBody(req, accountSchema)
	return ok(await resetPanelAccountPassword(admin, adminId))
})

/** Unlinking only stops future orders; the sub-panels already sold keep working. */
export const DELETE = route(async (req) => {
	const admin = await requireAdmin()
	return ok(await deletePanelPlan(admin, req.nextUrl.searchParams.get("planId") ?? ""))
})
