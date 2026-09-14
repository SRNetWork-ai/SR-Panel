import { assertClientKind, createClient, kindFromGB, listClients } from "@srpanel/core"
import { ok, parseBody, route } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { publicUrl, toClientDto } from "@/lib/dto"
import { createClientSchema } from "@/lib/schemas"

export const GET = route(async (req) => {
	const admin = await requireAdmin()
	const sp = req.nextUrl.searchParams
	const take = Math.min(200, Math.max(1, Number(sp.get("take") ?? 50)))
	const skip = Math.max(0, Number(sp.get("skip") ?? 0))
	const { items, total } = await listClients(admin, { q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, take, skip })
	const base = publicUrl()
	return ok({ items: items.map((c) => toClientDto(c, base)), total, take, skip })
})

export const POST = route(async (req) => {
	const admin = await requireAdmin()
	const body = await parseBody(req, createClientSchema)
	// 0 GB means «client unlimited»; the owner decides who may create which type
	// and which service is offered for it
	await assertClientKind(admin, kindFromGB(body.trafficGB), body.serviceId ?? null)
	// the form clears an empty optional field with `null`; core expects it absent
	const { client, errors } = await createClient(admin, { ...body, note: body.note ?? undefined, telegramId: body.telegramId ?? undefined, phone: body.phone ?? undefined })
	return ok({ client: toClientDto(client, publicUrl()), errors }, { status: 201 })
})
