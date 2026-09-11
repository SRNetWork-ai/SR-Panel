import { getUpdateOverview, jsonSafe } from "@srpanel/core"
import { requireOwner } from "@/lib/auth"
import { UpdatesClient } from "./UpdatesClient"

export const dynamic = "force-dynamic"

export default async function UpdatesPage() {
	await requireOwner()
	const initial = await getUpdateOverview()
	return <UpdatesClient initial={jsonSafe(initial) as never} />
}
