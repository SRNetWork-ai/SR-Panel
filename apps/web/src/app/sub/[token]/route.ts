import { buildSubscription, detectSubFormat, renderSubscription, resolveExternalUris } from "@srpanel/core"
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
 * Extra nodes the owner added by hand (single URIs or whole remote subscriptions).
 * A broken remote link must never break a customer's subscription, so every failure
 * degrades to "no extra nodes".
 */
async function extraUris(): Promise<readonly string[]> {
	try {
		return (await resolveExternalUris()).uris
	} catch {
		return []
	}
}

/**
 * Public subscription endpoint consumed by v2rayNG / Hiddify / Streisand / NekoBox /
 * Shadowrocket / Mihomo / sing-box. One URL, four dialects:
 *  - default: base64 body (+ subscription-userinfo headers)
 *  - ?format=links   : plain-text list of URIs
 *  - ?format=clash   : Clash / Mihomo YAML
 *  - ?format=singbox : sing-box JSON
 *  - browsers (Accept: text/html) are redirected to the styled page /s/<token>
 *
 * Without an explicit ?format the User-Agent decides, so importing the very same URL
 * into Mihomo or SFA already yields a full config.
 *
 * In the URI dialects the first entry is the informational (non-dialable) config that
 * shows quota and expiry inside the app; the full configs leave it out, because a fake
 * node would join the proxy groups and get picked by url-test.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
	const { token } = await params
	if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return new Response("not found", { status: 404 })

	const wantsHtml = (req.headers.get("accept") || "").includes("text/html") && !req.nextUrl.searchParams.has("format")
	// a *relative* Location keeps the browser on the host it came from
	if (wantsHtml) return new Response(null, { status: 302, headers: { location: `/s/${token}`, "cache-control": "no-store" } })

	const payload = await buildSubscription(token)
	if (!payload) return new Response("not found", { status: 404 })

	const publicUrl = publicBase(req)
	const pageUrl = `${publicUrl}/s/${token}`
	const title = `${payload.brand.name} • ${payload.client.name}`
	const rendered = renderSubscription(detectSubFormat(req.headers.get("user-agent"), req.nextUrl.searchParams.get("format")), {
		links: payload.links,
		base64: payload.base64,
		infoUri: payload.infoUri,
		extra: await extraUris(),
		title,
		group: payload.brand.name,
		pageUrl,
	})

	return new Response(rendered.body, {
		status: 200,
		headers: {
			"content-type": rendered.contentType,
			"cache-control": "no-store",
			"subscription-userinfo": payload.userInfo,
			"profile-title": "base64:" + Buffer.from(title, "utf8").toString("base64"),
			"profile-update-interval": "12",
			"profile-web-page-url": pageUrl,
			...(payload.brand.supportUrl ? { "support-url": payload.brand.supportUrl } : {}),
			"content-disposition": `attachment; filename="${encodeURIComponent(payload.client.name)}.${rendered.extension}"`,
		},
	})
}
