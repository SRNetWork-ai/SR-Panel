import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { AppError, jsonSafe } from "@srpanel/core"
import { guardPremiumPath } from "./premium"

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
	return NextResponse.json(jsonSafe(data), init)
}

export function fail(err: unknown): NextResponse {
	if (err instanceof AppError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
	if (err instanceof z.ZodError) {
		const first = err.issues[0]
		const where = first?.path?.length ? ` (${first.path.join(".")})` : ""
		return NextResponse.json({ error: `\u0648\u0631\u0648\u062f\u06cc \u0646\u0627\u0645\u0639\u062a\u0628\u0631${where}: ${first?.message ?? ""}`, code: "invalid_input", issues: err.issues }, { status: 400 })
	}
	console.error("[srpanel] api error", err)
	const message = err instanceof Error ? err.message : "\u062e\u0637\u0627\u06cc \u062f\u0627\u062e\u0644\u06cc"
	return NextResponse.json({ error: message, code: "internal" }, { status: 500 })
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
	const body = await req.json().catch(() => ({}))
	return schema.parse(body)
}

type Ctx<P> = { params: Promise<P> }

/**
 * Wraps a route handler with unified error handling and the premium gate: a
 * paid path answers 403 until this install has a license that covers it.
 */
export function route<P = Record<string, string>>(fn: (req: NextRequest, ctx: Ctx<P>) => Promise<Response>) {
	return async (req: NextRequest, ctx: Ctx<P>): Promise<Response> => {
		try {
			await guardPremiumPath(req.nextUrl.pathname)
			return await fn(req, ctx)
		} catch (err) {
			return fail(err)
		}
	}
}

export const zId = z.string().min(1).max(64)
