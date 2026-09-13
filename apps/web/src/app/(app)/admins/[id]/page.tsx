import { notFound } from "next/navigation"
import { adminDetail } from "@srpanel/core"
import { requireOwner } from "@/lib/auth"
import { AdminDetailClient } from "./AdminDetailClient"

export const dynamic = "force-dynamic"

export default async function AdminDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const owner = await requireOwner()
	const { id } = await params
	const detail = await adminDetail(owner, id).catch(() => null)
	if (!detail) notFound()
	return <AdminDetailClient detail={detail} />
}
