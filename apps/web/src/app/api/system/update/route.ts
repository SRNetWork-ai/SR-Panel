import { audit, cancelUpdateRequest, getUpdateOverview, requestUpdateJob } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

const actionSchema = z.object({ action: z.enum(["check", "update", "cancel"]) })

/** Owner-only: current version, host agent heartbeat, last job and last check. */
export const GET = route(async () => {
	await requireOwner()
	return ok(await getUpdateOverview())
})

/** Owner-only: queue a check / update job for the host agent, or drop a queued one. */
export const POST = route(async (req) => {
	const me = await requireOwner()
	const { action } = await parseBody(req, actionSchema)
	if (action === "cancel") {
		await cancelUpdateRequest()
		await audit(me.id, "system.update.cancel")
		return ok(await getUpdateOverview())
	}
	const job = await requestUpdateJob(action, me.id)
	await audit(me.id, `system.update.${action}`, job.id, { action, requestedAt: job.requestedAt })
	return ok({ job, overview: await getUpdateOverview() }, { status: 202 })
})
