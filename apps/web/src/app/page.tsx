import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getStoreByHost } from "@srpanel/core"
import { currentAdmin } from "@/lib/auth"

export const dynamic = "force-dynamic"

/** On a verified custom domain the root is the shop; on the panel host it is the panel. */
export default async function Home() {
	const h = await headers()
	const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0].toLowerCase()
	const shop = host ? await getStoreByHost(host).catch(() => null) : null
	if (shop) redirect(`/shop/${shop.settings.slug}`)
	const admin = await currentAdmin()
	redirect(admin ? "/dashboard" : "/login")
}
