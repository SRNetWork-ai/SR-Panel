import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { AppError, jsonSafe } from "@srpanel/core"

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
	return NextResponse.json(jsonSafe(data), init)
}

export function fail(err: unknown): NextResponse {
	if (err instanceof AppError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
	if (err instanceof z.ZodError) {
		const first = err.issues[0]
		const where = first?.path?.length ? ` (${first.path.join(".")})` : ""
		return NextResponse.json({ error: `ورودی نامعتبر${where}: ${first?.message ?? ""}`, code: "invalid_input", issues: err.issues }, { status: 400 })
	}
	console.error("[srpanel] api error", err)
	const message = err instanceof Error ? err.message : "خطای داخلی"
	return NextResponse.json({ error: message, code: "internal" }, { status: 500 })
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
	const body = await req.json().catch(() => ({}))
	return schema.parse(body)
}

type Ctx<P> = { params: Promise<P> }

/** Wraps a route handler with unified error handling. */
export function route<P = Record<string, string>>(fn: (req: NextRequest, ctx: Ctx<P>) => Promise<Response>) {
	return async (req: NextRequest, ctx: Ctx<P>): Promise<Response> => {
		try {
			return await fn(req, ctx)
		} catch (err) {
			return fail(err)
		}
	}
}

export const zId = z.string().min(1).max(64)
