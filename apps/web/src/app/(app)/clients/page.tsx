import { clientTypeAccess, listClients, listServices } from "@srpanel/core"
import { requireAdmin } from "@/lib/auth"
import { publicUrl, toClientDto, toServiceDto } from "@/lib/dto"
import { ClientsClient } from "./ClientsClient"
import { ClientsImportExportCard } from "./ClientsImportExportCard"

export const dynamic = "force-dynamic"

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ new?: string; q?: string; status?: string }> }) {
	const admin = await requireAdmin()
	const sp = await searchParams
	const [{ items, total }, services, access] = await Promise.all([
		listClients(admin, { q: sp.q, status: sp.status, take: 50, skip: 0 }),
		listServices(admin, { activeOnly: true }),
		clientTypeAccess(admin),
	])
	const base = publicUrl()
	return (
		<div className="space-y-4">
			<ClientsClient
				initial={{ items: items.map((c) => toClientDto(c, base)), total }}
				services={services.map(toServiceDto)}
				access={access}
				openNew={sp.new === "1"}
				isOwner={admin.role === "OWNER"}
			/>
			<ClientsImportExportCard />
		</div>
	)
}
