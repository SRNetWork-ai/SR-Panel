import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { jsonSafe, publicOrder } from "@srpanel/core"
import { OrderClient } from "./OrderClient"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "سفارش", robots: { index: false, follow: false } }

type Params = { params: Promise<{ token: string }>; searchParams: Promise<{ pay?: string }> }

export default async function OrderPage({ params, searchParams }: Params) {
	const { token } = await params
	const { pay } = await searchParams
	const order = await publicOrder(token)
	if (!order) notFound()
	return <OrderClient initial={jsonSafe(order) as never} payResult={pay} />
}
