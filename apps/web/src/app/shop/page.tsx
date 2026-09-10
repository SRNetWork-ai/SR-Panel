import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { getStoreByHost } from "@srpanel/core"

export const dynamic = "force-dynamic"

/** Custom-domain entry: https://shop.example.com/shop → resolves the admin store by host. */
export default async function ShopIndex() {
	const h = await headers()
	const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0].toLowerCase()
	const ctx = host ? await getStoreByHost(host) : null
	if (!ctx) notFound()
	redirect(`/shop/${ctx.settings.slug}`)
}
