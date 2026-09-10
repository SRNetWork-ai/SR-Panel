import { buildSubscription } from "@srpanel/core"
import type { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Public subscription endpoint consumed by v2rayNG / Hiddify / Streisand / NekoBox / Shadowrocket.
 *  - default: base64 body (+ subscription-userinfo headers)
 *  - ?format=links : plain-text list of URIs
 *  - browsers (Accept: text/html) are redirected to the styled page /s/<token>
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
	const { token } = await params
	if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return new Response("not found", { status: 404 })

	const wantsHtml = (req.headers.get("accept") || "").includes("text/html") && !req.nextUrl.searchParams.has("format")
	if (wantsHtml) return Response.redirect(new URL(`/s/${token}`, req.nextUrl.origin), 302)

	const payload = await buildSubscription(token)
	if (!payload) return new Response("not found", { status: 404 })

	const format = req.nextUrl.searchParams.get("format")
	const body = format === "links" ? payload.links.map((l) => l.uri).join("\n") + "\n" : payload.base64
	const publicUrl = (process.env.SRP_PUBLIC_URL || req.nextUrl.origin).replace(/\/+$/, "")

	return new Response(body, {
		status: 200,
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "no-store",
			"subscription-userinfo": payload.userInfo,
			"profile-title": "base64:" + Buffer.from(`${payload.brand.name} • ${payload.client.name}`, "utf8").toString("base64"),
			"profile-update-interval": "12",
			"profile-web-page-url": `${publicUrl}/s/${token}`,
			...(payload.brand.supportUrl ? { "support-url": payload.brand.supportUrl } : {}),
			"content-disposition": `attachment; filename="${encodeURIComponent(payload.client.name)}.txt"`,
		},
	})
}
