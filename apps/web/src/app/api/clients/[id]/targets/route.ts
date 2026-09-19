import { clientTargetOptions, setClientTargets } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { publicUrl, toClientDto } from "@/lib/dto"

const targetsInput = z.object({
	targets: z
		.array(z.object({ serverId: z.string().min(1), inboundId: z.number().int() }))
		.min(1)
		.max(200),
})

/** Servers + inbounds the current admin may attach this client to. */
export const GET = route(async () => {
	const admin = await requireAdmin()
	return ok(await clientTargetOptions(admin))
})

export const PUT = route<{ id: string }>(async (req, { params }) => {
	const admin = await requireAdmin()
	const { id } = await params
	const body = await parseBody(req, targetsInput)
	const r = await setClientTargets(admin, id, body.targets)
	return ok({ client: toClientDto(r.client, publicUrl()), errors: r.errors, added: r.added, removed: r.removed })
})
