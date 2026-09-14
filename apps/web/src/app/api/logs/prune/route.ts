import { audit, pruneLogs } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { clientIp, requireOwner } from "@/lib/auth"

/** Manual retention run — ignores the autoPrune switch. */
export const POST = route(async () => {
	const me = await requireOwner()
	const result = await pruneLogs({ force: true })
	await audit(me.id, "system.log_prune", null, result, await clientIp())
	return ok(result)
})
