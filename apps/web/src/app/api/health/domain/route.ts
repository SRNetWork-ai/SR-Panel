import { NextResponse, type NextRequest } from "next/server"
import { domainTokenForHost } from "@srpanel/core"

export const dynamic = "force-dynamic"

/**
 * Loop-back check for a custom shop domain (public on purpose, free forever).
 *
 * Only the panel a domain actually points at knows the token that was
 * generated for that host, so answering with it proves the DNS record reaches
 * this install. Nothing secret is exposed: the token is useless on its own.
 */
export async function GET(req: NextRequest) {
	const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0].toLowerCase()
	let token: string | null = null
	try {
		token = host ? await domainTokenForHost(host) : null
	} catch {
		token = null
	}
	return NextResponse.json({ ok: !!token, host, token }, { status: token ? 200 : 404, headers: { "cache-control": "no-store" } })
}
