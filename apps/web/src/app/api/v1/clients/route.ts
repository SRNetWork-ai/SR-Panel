import { createClient, listClients } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireApiKey } from "@/lib/apiAuth"
import { publicUrl, toClientDto } from "@/lib/dto"
import { v1CreateClientSchema } from "@/lib/schemas"

export const GET = route(async (req) => {
	const { admin } = await requireApiKey(req, "read")
	const sp = req.nextUrl.searchParams
	const take = Math.min(200, Math.max(1, Number(sp.get("take") || 50)))
	const skip = Math.max(0, Number(sp.get("skip") || 0))
	const { items, total } = await listClients(admin, { q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, take, skip })
	const base = publicUrl()
	return ok({ items: items.map((c) => toClientDto(c, base)), total, take, skip })
})

export const POST = route(async (req) => {
	const { admin } = await requireApiKey(req, "write")
	const body = await parseBody(req, v1CreateClientSchema)
	const { client, errors } = await createClient(admin, body as any)
	return ok({ client: toClientDto(client, publicUrl()), errors }, { status: 201 })
})
