import { listClients, listServersFor } from "@srpanel/core"
import { requireAdmin } from "@/lib/auth"
import { publicUrl, toClientDto, toServerDto } from "@/lib/dto"
import { ClientsClient } from "./ClientsClient"

export const dynamic = "force-dynamic"

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ new?: string; q?: string; status?: string }> }) {
	const admin = await requireAdmin()
	const sp = await searchParams
	const [{ items, total }, servers] = await Promise.all([
		listClients(admin, { q: sp.q, status: sp.status, take: 50, skip: 0 }),
		listServersFor(admin),
	])
	const base = publicUrl()
	return (
		<ClientsClient
			initial={{ items: items.map((c) => toClientDto(c, base)), total }}
			servers={servers.filter((s) => s.isActive).map(toServerDto)}
			openNew={sp.new === "1"}
			isOwner={admin.role === "OWNER"}
		/>
	)
}
