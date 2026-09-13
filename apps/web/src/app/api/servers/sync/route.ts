import { listServersFor, syncServers } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { toServerDto } from "@/lib/dto"

/**
 * Bulk sync in a single request (five panels at a time) instead of one HTTP
 * round-trip per server from the browser. Returns the refreshed server list.
 */
export const POST = route(async () => {
	const admin = await requireOwner()
	const result = await syncServers()
	const servers = (await listServersFor(admin)).map(toServerDto)
	return ok({ ...result, servers })
})
