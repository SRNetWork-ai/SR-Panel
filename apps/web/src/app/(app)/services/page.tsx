import { listAdmins, listServersFor, listServices } from "@srpanel/core"
import { requireOwner } from "@/lib/auth"
import { toServerDto, toServiceDto } from "@/lib/dto"
import { ServicesClient } from "./ServicesClient"

export const dynamic = "force-dynamic"

export default async function ServicesPage() {
	const owner = await requireOwner()
	const [services, servers, admins] = await Promise.all([listServices(owner), listServersFor(owner), listAdmins(owner)])
	return (
		<ServicesClient
			initial={services.map(toServiceDto)}
			servers={servers.filter((s) => s.isActive).map(toServerDto)}
			admins={admins.filter((a) => a.role !== "OWNER").map((a) => ({ id: a.id, username: a.username, displayName: a.displayName ?? null }))}
		/>
	)
}
