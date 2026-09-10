import "server-only"
import type { NextRequest } from "next/server"
import { authenticateApiKey, type ApiScope } from "@srpanel/core"

/** Public API auth: Authorization: Bearer srp_... */
export async function requireApiKey(req: NextRequest, scope: ApiScope = "read") {
	return authenticateApiKey(req.headers.get("authorization"), scope)
}
