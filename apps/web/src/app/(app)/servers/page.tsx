import { redirect } from "next/navigation"
import { listServersFor } from "@srpanel/core"
import { requireAdmin } from "@/lib/auth"
import { toServerDto } from "@/lib/dto"
import { ServersClient } from "./ServersClient"

export const dynamic = "force-dynamic"

export default async function ServersPage() {
	const admin = await requireAdmin()
	if (admin.role !== "OWNER") redirect("/dashboard")
	const servers = (await listServersFor(admin)).map(toServerDto)
	return <ServersClient initial={servers} />
}
