import { readFile } from "node:fs/promises"
import { canReview } from "@srpanel/core"
import { prisma } from "@srpanel/db"
import { route, zId } from "@/lib/api"
import { requireAdmin } from "@/lib/auth"
import { receiptMime, receiptPath } from "@/lib/uploads"

export const GET = route<{ paymentId: string }>(async (_req, ctx) => {
	const me = await requireAdmin()
	const { paymentId } = await ctx.params
	const p = await prisma.payment.findUnique({ where: { id: zId.parse(paymentId) } })
	if (!p || !p.receiptFile || !canReview(me, p)) return new Response("not found", { status: 404 })
	const buf = await readFile(receiptPath(p.receiptFile)).catch(() => null)
	if (!buf) return new Response("not found", { status: 404 })
	const ext = p.receiptFile.split(".").pop() || ""
	return new Response(new Uint8Array(buf), { headers: { "content-type": receiptMime(ext), "cache-control": "private, max-age=300", "content-disposition": `inline; filename="receipt-${p.id.slice(-6)}.${ext}"` } })
})
