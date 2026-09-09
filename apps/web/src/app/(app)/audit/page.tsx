import { redirect } from "next/navigation"
import { requireAdmin } from "@/lib/auth"
import { AuditClient } from "./AuditClient"

export const dynamic = "force-dynamic"

export default async function AuditPage() {
	const admin = await requireAdmin()
	if (admin.role !== "OWNER") redirect("/dashboard")
	return <AuditClient />
}
