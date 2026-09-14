import { audit, LOG_LEVELS, LOG_SOURCES, unifiedLog, unifiedLogCsv, type LogLevel, type LogSource } from "@srpanel/core"
import { route } from "@/lib/api"
import { clientIp, requireOwner } from "@/lib/auth"

const pick = <T extends string>(raw: string | null, all: readonly T[]): T[] | undefined => {
	if (!raw) return undefined
	const out = raw
		.split(",")
		.map((s) => s.trim())
		.filter((s): s is T => (all as readonly string[]).includes(s))
	return out.length ? out : undefined
}

/** CSV of the current filter (not just the visible page). */
export const GET = route(async (req) => {
	const me = await requireOwner()
	const sp = new URL(req.url).searchParams
	const raw = Number(sp.get("take"))
	const take = Number.isFinite(raw) && raw > 0 ? Math.min(5000, Math.trunc(raw)) : 2000
	const page = await unifiedLog({
		sources: pick<LogSource>(sp.get("sources"), LOG_SOURCES),
		levels: pick<LogLevel>(sp.get("levels"), LOG_LEVELS),
		q: sp.get("q") ?? undefined,
		adminId: sp.get("adminId") ?? undefined,
		from: sp.get("from") ?? undefined,
		to: sp.get("to") ?? undefined,
		skip: 0,
		take,
	})
	await audit(me.id, "system.log_export", null, { rows: page.items.length, q: sp.get("q") || null }, await clientIp())
	const name = `srpanel-logs-${new Date().toISOString().slice(0, 10)}.csv`
	return new Response(unifiedLogCsv(page.items), {
		headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` },
	})
})
