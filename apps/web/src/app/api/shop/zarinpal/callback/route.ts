import { handleZarinpalCallback } from "@srpanel/core"
import { NextResponse, type NextRequest } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
	const q = req.nextUrl.searchParams
	const paymentId = q.get("p") || ""
	const authority = q.get("Authority") || ""
	const status = q.get("Status") || "NOK"
	if (!paymentId) return NextResponse.redirect(new URL("/", req.nextUrl.origin))
	const r = await handleZarinpalCallback(paymentId, authority, status).catch((err) => ({ ok: false, redirect: new URL("/", req.nextUrl.origin).toString(), error: err instanceof Error ? err.message : String(err) }))
	return NextResponse.redirect(r.redirect)
}
