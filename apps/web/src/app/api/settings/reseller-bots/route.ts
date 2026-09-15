import { AppError, deleteResellerBot, getResellerBots, listResellerBots, resellerBotDto, saveResellerBotsConfig, setResellerBot, setResellerBotBlocked, setResellerBotEnabled } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin, requireOwner } from "@/lib/auth"

const configSchema = z.object({
	enabled: z.boolean().optional(),
	setupPrice: z.number().int().min(0).max(1_000_000_000).optional(),
	welcome: z.string().max(600).optional(),
})

const actionSchema = z.object({
	token: z.string().trim().min(10).max(200).optional(),
	enabled: z.boolean().optional(),
	adminId: z.string().min(1).optional(),
	blocked: z.boolean().optional(),
	remove: z.boolean().optional(),
})

/** Owner: switch + price + every registered bot. Reseller: the price and its own bot. */
export const GET = route(async () => {
	const me = await requireAdmin()
	const cfg = await getResellerBots()
	const isOwner = me.role === "OWNER"
	return ok({
		isOwner,
		config: { enabled: cfg.enabled, setupPrice: cfg.setupPrice, welcome: cfg.welcome },
		mine: resellerBotDto(me.id, cfg),
		bots: isOwner ? await listResellerBots() : [],
	})
})

export const PUT = route(async (req) => {
	const me = await requireOwner()
	const body = await parseBody(req, configSchema)
	const cfg = await saveResellerBotsConfig(me, body)
	return ok({ config: { enabled: cfg.enabled, setupPrice: cfg.setupPrice, welcome: cfg.welcome } })
})

export const POST = route(async (req) => {
	const me = await requireAdmin()
	const body = await parseBody(req, actionSchema)
	if (body.remove) return ok(await deleteResellerBot(me, body.adminId))
	if (body.adminId && body.blocked !== undefined) return ok({ bot: await setResellerBotBlocked(me, body.adminId, body.blocked) })
	if (body.token) return ok({ bot: await setResellerBot(me, body.token) })
	if (body.enabled !== undefined) return ok({ bot: await setResellerBotEnabled(me, body.enabled) })
	throw new AppError("درخواست نامعتبر است")
})
