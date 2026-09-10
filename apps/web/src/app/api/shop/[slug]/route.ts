import { getStoreBySlug, publicStorePayload } from "@srpanel/core"
import { ok, route } from "@/lib/api"

export const dynamic = "force-dynamic"

export const GET = route<{ slug: string }>(async (_req, ctx) => {
	const { slug } = await ctx.params
	const store = await getStoreBySlug(slug)
	if (!store) return new Response(JSON.stringify({ error: "فروشگاه پیدا نشد" }), { status: 404, headers: { "content-type": "application/json" } })
	return ok(await publicStorePayload(store))
})
