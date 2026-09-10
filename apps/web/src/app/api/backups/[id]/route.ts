import { createReadStream } from "node:fs"
import { Readable } from "node:stream"
import { audit, backupFilePath, deleteBackup } from "@srpanel/core"
import { ok, route, zId } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

export const GET = route<{ id: string }>(async (_req, ctx) => {
	const me = await requireOwner()
	const { id } = await ctx.params
	const { path, backup } = await backupFilePath(zId.parse(id))
	await audit(me.id, "backup.download", backup.id, { fileName: backup.fileName })
	const stream = Readable.toWeb(createReadStream(path)) as ReadableStream
	return new Response(stream, {
		headers: {
			"content-type": "application/gzip",
			"content-disposition": `attachment; filename="${backup.fileName}"`,
			...(backup.sizeBytes ? { "content-length": backup.sizeBytes.toString() } : {}),
			"cache-control": "no-store",
		},
	})
})

export const DELETE = route<{ id: string }>(async (_req, ctx) => {
	const me = await requireOwner()
	const { id } = await ctx.params
	await deleteBackup(zId.parse(id))
	await audit(me.id, "backup.delete", id)
	return ok({ ok: true })
})
