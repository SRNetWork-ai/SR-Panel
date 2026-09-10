import { publicOrder } from "@srpanel/core"
import { ok, route } from "@/lib/api"

export const dynamic = "force-dynamic"

export const GET = route<{ token: string }>(async (_req, ctx) => {
	const { token } = await ctx.params
	if (!/^[A-Za-z0-9_-]{10,128}$/.test(token)) return new Response("not found", { status: 404 })
	const o = await publicOrder(token)
	if (!o) return new Response(JSON.stringify({ error: "سفارش پیدا نشد" }), { status: 404, headers: { "content-type": "application/json" } })
	return ok(o)
})
