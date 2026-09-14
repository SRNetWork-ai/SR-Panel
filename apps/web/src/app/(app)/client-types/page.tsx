import { getClientTypeSettings, listServices } from "@srpanel/core"
import { requireOwner } from "@/lib/auth"
import { toServiceDto } from "@/lib/dto"
import { ClientTypesClient } from "./ClientTypesClient"

export const dynamic = "force-dynamic"

/** Owner-only: who may sell «client limited» / «client unlimited» and on which service. */
export default async function ClientTypesPage() {
	const admin = await requireOwner()
	const [settings, services] = await Promise.all([getClientTypeSettings(), listServices(admin, { activeOnly: false })])
	return <ClientTypesClient settings={settings} services={services.map(toServiceDto)} />
}
