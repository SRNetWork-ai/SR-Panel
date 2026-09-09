import { redirect } from "next/navigation"
import { listAdmins, listServersFor } from "@srpanel/core"
import { requireAdmin } from "@/lib/auth"
import { toAdminDto, toServerDto } from "@/lib/dto"
import { AdminsClient } from "./AdminsClient"

export const dynamic = "force-dynamic"

export default async function AdminsPage() {
	const admin = await requireAdmin()
	if (admin.role !== "OWNER") redirect("/dashboard")
	const [admins, servers] = await Promise.all([listAdmins(admin), listServersFor(admin)])
	return <AdminsClient initial={admins.map((a) => toAdminDto(a as any))} servers={servers.map(toServerDto)} selfId={admin.id} />
}
