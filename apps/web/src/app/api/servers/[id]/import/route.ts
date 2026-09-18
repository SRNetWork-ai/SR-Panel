import { importPanelClients, scanPanelClients } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

/** Read-only scan of the clients the panel itself already holds. */
export const GET = route<{ id: string }>(async (_req, { params }) => {
	await requireOwner()
	const { id } = await params
	return ok(await scanPanelClients(id))
})

const importSchema = z.object({ emails: z.array(z.string().min(1).max(200)).max(1000).optional() })

/** Adopts the picked clients - every importable one when `emails` is omitted. */
export const POST = route<{ id: string }>(async (req, { params }) => {
	const admin = await requireOwner()
	const { id } = await params
	const { emails } = await parseBody(req, importSchema)
	return ok(await importPanelClients(admin, id, emails))
})
