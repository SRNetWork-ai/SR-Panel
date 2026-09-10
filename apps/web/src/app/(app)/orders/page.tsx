import { prisma } from "@srpanel/db"
import { requireAdmin } from "@/lib/auth"
import { OrdersClient } from "./OrdersClient"

export const dynamic = "force-dynamic"

export default async function OrdersPage() {
	const me = await requireAdmin()
	const pendingReview = await prisma.payment.count({ where: { status: "REVIEW", ...(me.role === "OWNER" ? {} : { adminId: me.id }) } })
	return <OrdersClient isOwner={me.role === "OWNER"} pendingReview={pendingReview} />
}
