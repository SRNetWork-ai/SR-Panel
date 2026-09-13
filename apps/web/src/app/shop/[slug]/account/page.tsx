import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getStoreBySlug, jsonSafe, publicStorePayload } from "@srpanel/core"
import { AccountView } from "./AccountView"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
	const { slug } = await params
	const ctx = await getStoreBySlug(slug)
	if (!ctx) return { title: "Store not found" }
	const store = await publicStorePayload(ctx)
	return { title: "حساب من — " + store.title, robots: { index: false } }
}

/** Dashboard of a storefront customer (session cookie `srp_shop`). */
export default async function AccountPage({ params }: Params) {
	const { slug } = await params
	const ctx = await getStoreBySlug(slug)
	if (!ctx) notFound()
	const store = await publicStorePayload(ctx)
	return <AccountView store={jsonSafe(store) as never} />
}
