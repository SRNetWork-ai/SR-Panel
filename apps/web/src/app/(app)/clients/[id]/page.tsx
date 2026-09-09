import { notFound } from "next/navigation"
import { NotFoundError, buildSubscription, clientUsageSeries, getClientForActor } from "@srpanel/core"
import { requireAdmin } from "@/lib/auth"
import { publicUrl, toClientDto } from "@/lib/dto"
import { ClientDetail } from "./ClientDetail"

export const dynamic = "force-dynamic"

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
	const admin = await requireAdmin()
	const { id } = await params
	let client
	try {
		client = await getClientForActor(admin, id)
	} catch (err) {
		if (err instanceof NotFoundError) notFound()
		throw err
	}
	const [usage, sub] = await Promise.all([clientUsageSeries(id, 30), buildSubscription(client.subToken)])
	return <ClientDetail initial={toClientDto(client, publicUrl())} usage={usage} links={sub?.links ?? []} />
}
