import { getUpdateOverview, jsonSafe } from "@srpanel/core"
import { requireOwner } from "@/lib/auth"
import { UpdateAuto } from "./UpdateAuto"
import { UpdatesClient } from "./UpdatesClient"

export const dynamic = "force-dynamic"

export default async function UpdatesPage() {
	await requireOwner()
	const initial = await getUpdateOverview()
	return (
		<div className="space-y-4">
			<UpdatesClient initial={jsonSafe(initial) as never} />
			<UpdateAuto />
		</div>
	)
}
