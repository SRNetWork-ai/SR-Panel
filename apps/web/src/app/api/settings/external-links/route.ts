import { deleteExternalLink, externalLinks, probeExternalLink, resolveExternalUris, saveExternalLink } from "@srpanel/core"
import { z } from "zod"
import { ok, parseBody, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

/**
 * External links: extra nodes and remote subscriptions the owner merges into the
 * subscription of every client. Owner-only on every verb, because one bad entry
 * lands in every customer's app at once.
 */
const saveSchema = z.object({
	id: z.string().trim().max(40).optional(),
	enabled: z.boolean().optional(),
	title: z.string().trim().max(80).optional(),
	kind: z.enum(["uri", "sub"]).optional(),
	value: z.string().trim().min(3).max(4096),
})

const probeSchema = z.object({
	value: z.string().trim().min(3).max(4096),
	kind: z.enum(["uri", "sub"]).optional(),
})

/** The entries plus what each one currently resolves to (remote lists are cached). */
export const GET = route(async () => {
	await requireOwner()
	const [book, resolved] = await Promise.all([externalLinks(), resolveExternalUris()])
	return ok({ entries: book.entries, statuses: resolved.statuses, total: resolved.uris.length })
})

/** Create or edit (the same call does both: an existing id updates in place). */
export const PUT = route(async (req) => {
	const me = await requireOwner()
	const body = await parseBody(req, saveSchema)
	return ok({ entry: await saveExternalLink(me.id, body) })
})

/** "Test" button: resolve one value without storing it. */
export const POST = route(async (req) => {
	await requireOwner()
	const body = await parseBody(req, probeSchema)
	return ok(await probeExternalLink(body))
})

export const DELETE = route(async (req) => {
	const me = await requireOwner()
	return ok({ removed: await deleteExternalLink(me.id, req.nextUrl.searchParams.get("id") ?? "") })
})
