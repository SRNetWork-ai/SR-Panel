import { redirect } from "next/navigation"
import { listAdmins, listServersFor, listServices } from "@srpanel/core"
import { requireAdmin } from "@/lib/auth"
import { toAdminDto, toServiceDto } from "@/lib/dto"
import { AdminsClient } from "./AdminsClient"

export const dynamic = "force-dynamic"

export default async function AdminsPage() {
	const admin = await requireAdmin()
	if (admin.role !== "OWNER") redirect("/dashboard")
	const [admins, servers, services] = await Promise.all([listAdmins(admin), listServersFor(admin), listServices(admin)])
	return (
		<AdminsClient
			initial={admins.map((a) => toAdminDto(a as any))}
			servers={servers.map((s) => ({ id: s.id, name: s.name }))}
			services={services.map(toServiceDto).map((s) => ({ id: s.id, name: s.name, isActive: s.isActive, adminIds: s.adminIds, targetCount: s.targets.length }))}
			selfId={admin.id}
		/>
	)
}
