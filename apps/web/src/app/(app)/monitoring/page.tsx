import { monitoringOverview } from "@srpanel/core"
import { requireOwner } from "@/lib/auth"
import { MonitoringClient } from "./MonitoringClient"

export const dynamic = "force-dynamic"

export default async function MonitoringPage() {
	await requireOwner()
	const overview = await monitoringOverview()
	return <MonitoringClient initial={JSON.parse(JSON.stringify(overview))} />
}
