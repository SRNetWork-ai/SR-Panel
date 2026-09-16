import { getMailSettings, mailDto, saveMailSettings, sendTestMail } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

const putSchema = z.object({
	enabled: z.boolean().optional(),
	host: z.string().trim().max(200).optional(),
	port: z.number().int().min(1).max(65535).optional(),
	user: z.string().trim().max(200).optional(),
	/** blank keeps the stored password */
	pass: z.string().max(400).optional(),
	from: z.string().trim().max(200).optional(),
	fromName: z.string().trim().max(80).optional(),
	to: z.string().trim().max(200).optional(),
	loginCode: z.boolean().optional(),
	ttlMin: z.number().int().min(1).max(60).optional(),
})

const postSchema = z.object({ to: z.string().trim().max(200).optional() })

/** Mail credentials are owner-only, on every verb. */
export const GET = route(async () => {
	await requireOwner()
	return ok({ mail: mailDto(await getMailSettings()) })
})

export const PUT = route(async (req) => {
	const me = await requireOwner()
	const body = await parseBody(req, putSchema)
	return ok({ mail: await saveMailSettings(me, body) })
})

export const POST = route(async (req) => {
	const me = await requireOwner()
	const body = await parseBody(req, postSchema)
	return ok(await sendTestMail(me, body.to))
})
