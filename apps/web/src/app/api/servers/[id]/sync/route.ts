import { syncServer } from "@srpanel/core"
import { prisma } from "@srpanel/db"
import { ok, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"
import { toServerDto } from "@/lib/dto"

export const POST = route<{ id: string }>(async (_req, { params }) => {
	await requireOwner()
	const { id } = await params
	const result = await syncServer(id)
	const server = await prisma.server.findUniqueOrThrow({ where: { id } })
	return ok({ ...result, server: toServerDto(server) })
})
