import { LOG_LEVELS, LOG_SOURCES, unifiedLog, unifiedLogStats, type LogLevel, type LogSource } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { requireOwner } from "@/lib/auth"

const pick = <T extends string>(raw: string | null, all: readonly T[]): T[] | undefined => {
	if (!raw) return undefined
	const out = raw
		.split(",")
		.map((s) => s.trim())
		.filter((s): s is T => (all as readonly string[]).includes(s))
	return out.length ? out : undefined
}

export const GET = route(async (req) => {
	await requireOwner()
	const sp = new URL(req.url).searchParams
	const num = (key: string) => {
		const raw = sp.get(key)
		if (!raw) return undefined
		const n = Number(raw)
		return Number.isFinite(n) ? n : undefined
	}
	const page = await unifiedLog({
		sources: pick<LogSource>(sp.get("sources"), LOG_SOURCES),
		levels: pick<LogLevel>(sp.get("levels"), LOG_LEVELS),
		q: sp.get("q") ?? undefined,
		adminId: sp.get("adminId") ?? undefined,
		from: sp.get("from") ?? undefined,
		to: sp.get("to") ?? undefined,
		skip: num("skip"),
		take: num("take"),
	})
	const stats = sp.get("stats") === "1" ? await unifiedLogStats() : null
	return ok({ ...page, stats })
})
