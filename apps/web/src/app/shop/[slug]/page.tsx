import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getStoreBySlug, jsonSafe, publicStoreCatalog, publicStorePayload } from "@srpanel/core"
import { ShopClient } from "./ShopClient"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ renew?: string; tg?: string; plan?: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
	const { slug } = await params
	const ctx = await getStoreBySlug(slug)
	if (!ctx) return { title: "Store not found" }
	const store = await publicStorePayload(ctx)
	return { title: store.title, description: store.description ?? store.brand.tagline ?? undefined, robots: { index: true } }
}

export default async function ShopPage({ params, searchParams }: Params) {
	const { slug } = await params
	const { renew, tg, plan } = await searchParams
	const ctx = await getStoreBySlug(slug)
	if (!ctx) notFound()
	const store = await publicStorePayload(ctx)
	// categories & extended plan options live in the Setting table (see core/storeCatalog)
	const catalog = await publicStoreCatalog(ctx.admin.id, store.plans)
	return <ShopClient store={jsonSafe(store) as never} catalog={jsonSafe(catalog) as never} renewToken={renew} tgParam={tg} planParam={plan} />
}
