import { audit, resolveIncidentManually } from "@srpanel/core"
import { ok, route, zId } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

export const POST = route<{ id: string }>(async (_req, ctx) => {
	const me = await requireOwner()
	const { id } = await ctx.params
	const incident = await resolveIncidentManually(zId.parse(id))
	await audit(me.id, "incident.resolve", incident.id, { kind: incident.kind, serverId: incident.serverId })
	return ok({ incident })
})
