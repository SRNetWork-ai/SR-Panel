import { buildSubscription } from "@srpanel/core"
import type { NextRequest } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Absolute base URL of the panel as the visitor sees it.
 *
 * `req.nextUrl.origin` is the *internal* origin (http://localhost:3000 inside the
 * container), so it must never leak into a redirect or a header — the client would
 * try to open localhost. We prefer the configured public URL and otherwise trust
 * the proxy headers.
 */
function publicBase(req: NextRequest): string {
	const configured = (process.env.SRP_PUBLIC_URL || "").trim().replace(/\/+$/, "")
	if (configured) return configured
	const host = req.headers.get("x-forwarded-host") || req.headers.get("host")
	const proto = (req.headers.get("x-forwarded-proto") || "http").split(",")[0].trim()
	return host ? `${proto}://${host}` : req.nextUrl.origin.replace(/\/+$/, "")
}

/**
 * Public subscription endpoint consumed by v2rayNG / Hiddify / Streisand / NekoBox / Shadowrocket.
 *  - default: base64 body (+ subscription-userinfo headers)
 *  - ?format=links : plain-text list of URIs
 *  - browsers (Accept: text/html) are redirected to the styled page /s/<token>
 *
 * The first URI is always the informational (non-dialable) config that shows quota
 * and expiry inside the app itself.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
	const { token } = await params
	if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return new Response("not found", { status: 404 })

	const wantsHtml = (req.headers.get("accept") || "").includes("text/html") && !req.nextUrl.searchParams.has("format")
	// a *relative* Location keeps the browser on the host it came from
	if (wantsHtml) return new Response(null, { status: 302, headers: { location: `/s/${token}`, "cache-control": "no-store" } })

	const payload = await buildSubscription(token)
	if (!payload) return new Response("not found", { status: 404 })

	const format = req.nextUrl.searchParams.get("format")
	const uris = payload.infoUri ? [payload.infoUri, ...payload.links.map((l) => l.uri)] : payload.links.map((l) => l.uri)
	const body = format === "links" ? uris.join("\n") + "\n" : payload.base64
	const publicUrl = publicBase(req)

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
