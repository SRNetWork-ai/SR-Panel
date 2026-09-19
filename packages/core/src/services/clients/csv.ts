/**
 * CSV export / import of clients.
 *
 * Export mirrors the clients list (same actor scope, same filters) so an operator can
 * hand the file to accounting or move a panel somewhere else. Import is a plain loop
 * over `createClient`, on purpose: reseller caps, client-type rules, wallet billing and
 * the panel push must behave exactly like the one-by-one form.
 *
 * No schema change - the `targets` column is `«server name»:«inbound id»` pairs joined
 * by `|`, which is what the create form sends anyway.
 */
import { prisma, type Admin } from "@srpanel/db"
import { bytesToGb } from "../../util/bytes"
import { audit } from "../audit"
import { listServersFor } from "../servers"
import { clientScope } from "./access"
import { createClient } from "./crud"
import type { ClientTarget } from "./types"

const DAY_MS = 86_400_000
const GB = 1024 ** 3

/** One export never returns more than this. */
export const CLIENT_EXPORT_MAX = 5000
/** One import never creates more than this. */
export const CLIENT_IMPORT_MAX = 200

export const CLIENT_CSV_COLUMNS = [
	"name",
	"tag",
	"uuid",
	"status",
	"trafficGB",
	"usedGB",
	"days",
	"expiresAt",
	"ipLimit",
	"telegramId",
	"phone",
	"note",
	"targets",
	"subToken",
] as const

export interface ClientExportFilter {
	q?: string
	status?: string
}

export interface ClientImportError {
	row: number
	name: string
	message: string
}

export interface ClientImportResult {
	rows: number
	created: number
	failed: number
	/** nothing was written, the file was only validated */
	dryRun: boolean
	errors: ClientImportError[]
}

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`

/** UTF-8 CSV with BOM so Excel opens Persian names correctly. */
export async function exportClientsCsv(actor: Admin, filter: ClientExportFilter = {}): Promise<string> {
	const where: Record<string, unknown> = { ...clientScope(actor) }
	if (filter.status) where.status = filter.status
	if (filter.q) {
		where.OR = [
			{ name: { contains: filter.q, mode: "insensitive" } },
			{ tag: { contains: filter.q, mode: "insensitive" } },
			{ note: { contains: filter.q, mode: "insensitive" } },
		]
	}
	const rows = await prisma.client.findMany({
		where,
		orderBy: { createdAt: "asc" },
		take: CLIENT_EXPORT_MAX,
		include: { servers: { include: { server: { select: { name: true } } } } },
	})
	const now = Date.now()
	const lines = [CLIENT_CSV_COLUMNS.join(",")]
	for (const c of rows) {
		const used = Number(c.usedUp) + Number(c.usedDown)
		const days = c.expiresAt ? Math.max(0, Math.ceil((c.expiresAt.getTime() - now) / DAY_MS)) : 0
		const targets = c.servers.map((s) => `${s.server.name}:${s.inboundId}`).join("|")
		lines.push(
			[
				c.name,
				c.tag ?? "",
				c.uuid,
				c.status,
				bytesToGb(c.trafficLimit),
				Math.round((used / GB) * 100) / 100,
				days,
				c.expiresAt ? c.expiresAt.toISOString() : "",
				c.ipLimit,
				c.telegramId ?? "",
				c.phone ?? "",
				c.note ?? "",
				targets,
				c.subToken,
			]
				.map(esc)
				.join(","),
		)
	}
	await audit(actor.id, "client.export", null, { rows: rows.length, q: filter.q ?? null, status: filter.status ?? null })
	return `\uFEFF${lines.join("\r\n")}\r\n`
}

/** Minimal RFC-4180 reader: quoted fields, doubled quotes, CRLF or LF. */
function parseCsv(text: string): string[][] {
	const src = text.replace(/^\uFEFF/, "")
	const rows: string[][] = []
	let row: string[] = []
	let field = ""
	let quoted = false
	for (let i = 0; i < src.length; i++) {
		const ch = src[i]!
		if (quoted) {
			if (ch !== '"') field += ch
			else if (src[i + 1] === '"') {
				field += '"'
				i++
			} else quoted = false
			continue
		}
		if (ch === '"') quoted = true
		else if (ch === ",") {
			row.push(field)
			field = ""
		} else if (ch === "\n") {
			row.push(field)
			rows.push(row)
			row = []
			field = ""
		} else if (ch !== "\r") field += ch
	}
	if (field !== "" || row.length > 0) {
		row.push(field)
		rows.push(row)
	}
	// a trailing newline or an empty line is not a client
	return rows.filter((r) => r.some((cell) => cell.trim() !== ""))
}

/**
 * Creates the clients of a CSV file. `dryRun` validates everything (names, numbers,
 * server/inbound resolution) without writing a single row.
 */
export async function importClientsCsv(actor: Admin, text: string, dryRun = false): Promise<ClientImportResult> {
	const table = parseCsv(text)
	const result: ClientImportResult = { rows: 0, created: 0, failed: 0, dryRun, errors: [] }
	if (table.length < 2) return result
	// "traffic GB", "traffic_gb" and "trafficGB" are the same column
	const head = table[0]!.map((h) => h.trim().toLowerCase().replace(/[\s_-]/g, ""))
	const at = (row: string[], key: string): string => {
		const i = head.indexOf(key)
		return i < 0 ? "" : (row[i] ?? "").trim()
	}
	const body = table.slice(1, 1 + CLIENT_IMPORT_MAX)
	result.rows = body.length
	const servers = await listServersFor(actor)
	const byName = new Map(servers.map((s) => [s.name.trim().toLowerCase(), s.id]))
	for (let i = 0; i < body.length; i++) {
		const row = body[i]!
		const name = at(row, "name")
		try {
			if (!name) throw new Error("ستون name خالی است")
			const trafficGB = Math.max(0, Math.trunc(Number(at(row, "trafficgb") || 0)))
			if (!Number.isFinite(trafficGB)) throw new Error("مقدار trafficGB نامعتبر است")
			let days = Math.trunc(Number(at(row, "days") || 0))
			const expiresAt = at(row, "expiresat")
			// a file that only carries the expiry date still knows how many days are left
			if (!days && expiresAt) {
				const when = new Date(expiresAt).getTime()
				if (Number.isFinite(when)) days = Math.max(0, Math.ceil((when - Date.now()) / DAY_MS))
			}
			if (!Number.isFinite(days) || days < 0) throw new Error("مقدار days نامعتبر است")
			const targets: ClientTarget[] = at(row, "targets")
				.split("|")
				.map((t) => t.trim())
				.filter(Boolean)
				.map((t) => {
					const cut = t.lastIndexOf(":")
					const serverId = cut < 0 ? undefined : byName.get(t.slice(0, cut).trim().toLowerCase())
					const inboundId = Number(t.slice(cut + 1))
					if (!serverId || !Number.isInteger(inboundId)) throw new Error(`مقصد نامعتبر یا خارج از دسترس: ${t}`)
					return { serverId, inboundId }
				})
			const ipLimit = at(row, "iplimit")
			if (dryRun) {
				result.created++
				continue
			}
			await createClient(actor, {
				name,
				tag: at(row, "tag") || undefined,
				trafficGB,
				days,
				ipLimit: ipLimit ? Math.max(0, Math.trunc(Number(ipLimit))) : undefined,
				note: at(row, "note") || undefined,
				telegramId: at(row, "telegramid") || undefined,
				phone: at(row, "phone") || undefined,
				targets: targets.length ? targets : undefined,
			})
			result.created++
		} catch (err) {
			result.failed++
			// +2: the header line and the 1-based numbering of a spreadsheet
			result.errors.push({ row: i + 2, name, message: (err instanceof Error ? err.message : String(err)).slice(0, 200) })
		}
	}
	if (result.errors.length > 20) result.errors = result.errors.slice(0, 20)
	await audit(actor.id, dryRun ? "client.import.check" : "client.import", null, { rows: result.rows, created: result.created, failed: result.failed })
	return result
}
