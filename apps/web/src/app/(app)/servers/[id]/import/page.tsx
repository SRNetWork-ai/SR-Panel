import { notFound, redirect } from "next/navigation"
import { prisma } from "@srpanel/db"
import { requireAdmin } from "@/lib/auth"
import { ImportClientsClient } from "./ImportClientsClient"

export const dynamic = "force-dynamic"

export default async function ServerImportPage({ params }: { params: Promise<{ id: string }> }) {
	const admin = await requireAdmin()
	if (admin.role !== "OWNER") redirect("/dashboard")
	const { id } = await params
	const server = await prisma.server.findUnique({ where: { id }, select: { id: true, name: true } })
	if (!server) notFound()
	return <ImportClientsClient serverId={server.id} serverName={server.name} />
}
