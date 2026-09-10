import { NextResponse } from "next/server"
import { prisma } from "@srpanel/db"

export const dynamic = "force-dynamic"

/** Liveness/readiness probe used by the docker-compose healthcheck, the installer and the `SR` CLI. */
export async function GET() {
	let db = false
	try {
		await prisma.$queryRaw`SELECT 1`
		db = true
	} catch {
		db = false
	}
	const body = {
		ok: db,
		db,
		version: process.env.npm_package_version ?? "1.2.0",
		time: new Date().toISOString(),
	}
	return NextResponse.json(body, { status: db ? 200 : 503, headers: { "cache-control": "no-store" } })
}
