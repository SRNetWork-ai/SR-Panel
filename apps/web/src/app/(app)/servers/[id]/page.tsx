import { notFound, redirect } from "next/navigation"
import { serverDetail } from "@srpanel/core"
import { requireAdmin } from "@/lib/auth"
import { ServerDetailClient } from "./ServerDetailClient"

export const dynamic = "force-dynamic"

export default async function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const admin = await requireAdmin()
	if (admin.role !== "OWNER") redirect("/dashboard")
	const { id } = await params
	const detail = await serverDetail(id).catch(() => null)
	if (!detail) notFound()
	return <ServerDetailClient initial={detail} />
}
