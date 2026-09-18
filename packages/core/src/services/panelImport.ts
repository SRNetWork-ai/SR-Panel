import { prisma, type Admin } from "@srpanel/db"
import type { InboundProtocol, PanelClientStat } from "../panels/types"
import { randomToken } from "../security/token"
import { AppError, ForbiddenError, NotFoundError } from "../util/errors"
import { sanitizeConfigName } from "../util/naming"
import { audit } from "./audit"
import { setPendingStart, withPendingNote } from "./pendingStart"
import { adapterFor, recomputeClient } from "./servers"

/**
 * Adopting clients that already live on a 3x-ui panel.
 *
 * The panel is only ever read here: the scan calls `/panel/api/inbounds/list` and the
 * import copies what it found into our own tables. That is what keeps an existing
 * customer base working - the remote email (the key xray counts traffic by) and the
 * client UUID are reused as-is, so every config already handed out stays valid.
 *
 * Owner-only on purpose: a reseller must not be able to claim clients it never sold.
 */

const DAY_MS = 86_400_000
const IMPORT_NOTE = "ایمپورت‌شده از پنل"

export interface PanelClientRow {
	email: string
	uuid: string
	protocol: InboundProtocol
	inboundIds: number[]
	/** 0 = unlimited */
	totalBytes: number
	expiresAt: string | null
	/** 3x-ui delayed start: days counted from the first connection */
	pendingDays: number
	limitIp: number
	enable: boolean
	up: number
	down: number
	tgId: string
	/** Already managed by SRPanel on this server (same remote email) */
	linked: boolean
	/** Another SRPanel client already owns this UUID */
	uuidTaken: boolean
	importable: boolean
}

export interface PanelScanResult {
	server: { id: string; name: string; baseUrl: string }
	rows: PanelClientRow[]
	total: number
	linkedCount: number
	importableCount: number
}

export interface PanelImportResult {
	imported: number
	skipped: number
	errors: string[]
	clientIds: string[]
}

/** 3x-ui keeps the real client list inside the inbound `settings` blob. */
function clientsOf(settings: Record<string, any> | null | undefined): Array<Record<string, any>> {
	const raw = settings?.clients
	return Array.isArray(raw) ? (raw as Array<Record<string, any>>) : []
}

function num(value: unknown): number {
	const n = Number(value)
	return Number.isFinite(n) ? n : 0
}

/** Reads every client of every inbound and marks which of them we could adopt. */
export async function scanPanelClients(serverId: string): Promise<PanelScanResult> {
	const server = await prisma.server.findUnique({ where: { id: serverId } })
	if (!server) throw new NotFoundError("سرور پیدا نشد")
	const adapter = adapterFor(server)
	await adapter.login()
	const inbounds = await adapter.listInbounds()

	// xray counts by email, so for a duplicated email the heaviest row is the truth
	const stats = new Map<string, PanelClientStat>()
	for (const ib of inbounds) {
		for (const s of ib.clientStats ?? []) {
			const prev = stats.get(s.email)
			if (!prev || s.up + s.down > prev.up + prev.down) stats.set(s.email, s)
		}
	}

	// one row per email: a client attached to several inbounds is a single client
	const rows = new Map<string, PanelClientRow>()
	for (const ib of inbounds) {
		for (const c of clientsOf(ib.settings)) {
			const email = String(c.email ?? "").trim()
			if (!email) continue
			const found = rows.get(email)
			if (found) {
				if (!found.inboundIds.includes(ib.id)) found.inboundIds.push(ib.id)
				continue
			}
			const stat = stats.get(email)
			const expiry = num(stat?.expiryTime ?? c.expiryTime)
			rows.set(email, {
				email,
				// vless/vmess carry `id`, trojan/shadowsocks carry `password`
				uuid: String(c.id ?? c.password ?? "").trim(),
				protocol: ib.protocol,
				inboundIds: [ib.id],
				totalBytes: Math.max(0, Math.round(num(stat?.total ?? c.totalGB))),
				expiresAt: expiry > 0 ? new Date(expiry).toISOString() : null,
				pendingDays: expiry < 0 ? Math.min(3650, Math.max(1, Math.round(-expiry / DAY_MS))) : 0,
				limitIp: Math.max(0, Math.round(num(c.limitIp))),
				enable: stat ? stat.enable : c.enable !== false,
				up: Math.max(0, Math.round(num(stat?.up))),
				down: Math.max(0, Math.round(num(stat?.down))),
				tgId: String(c.tgId ?? "").trim(),
				linked: false,
				uuidTaken: false,
				importable: false,
			})
		}
	}

	const list = [...rows.values()]
	for (const row of list) row.inboundIds.sort((a, b) => a - b)
	list.sort((a, b) => a.email.localeCompare(b.email))

	const links = await prisma.clientServer.findMany({ where: { serverId }, select: { remoteEmail: true } })
	const linked = new Set(links.map((l) => l.remoteEmail))
	const uuids = [...new Set(list.map((r) => r.uuid).filter(Boolean))]
	const taken = uuids.length
		? new Set((await prisma.client.findMany({ where: { uuid: { in: uuids } }, select: { uuid: true } })).map((c) => c.uuid))
		: new Set<string>()
	for (const row of list) {
		row.linked = linked.has(row.email)
		row.uuidTaken = !!row.uuid && taken.has(row.uuid)
		// a client without a UUID cannot be rebuilt into a working config
		row.importable = !row.linked && !row.uuidTaken && !!row.uuid
	}

	return {
		server: { id: server.id, name: server.name, baseUrl: server.baseUrl },
		rows: list,
		total: list.length,
		linkedCount: list.filter((r) => r.linked).length,
		importableCount: list.filter((r) => r.importable).length,
	}
}

/**
 * Creates a local client for every picked panel client. Nothing is pushed back to the
 * panel, so an import can never overwrite or disable a live customer; the next sync
 * simply starts reporting their usage.
 */
export async function importPanelClients(actor: Admin, serverId: string, emails?: string[]): Promise<PanelImportResult> {
	if (actor.role !== "OWNER") throw new ForbiddenError("ایمپورت کلاینت‌های پنل فقط برای اونر مجاز است")
	const scan = await scanPanelClients(serverId)
	const wanted = emails?.length ? new Set(emails.map((e) => e.trim()).filter(Boolean)) : null
	const picked = scan.rows.filter((r) => !r.linked && (wanted ? wanted.has(r.email) : true))
	if (!picked.length) throw new AppError("کلاینت جدیدی برای ایمپورت پیدا نشد")
	const errors: string[] = []
	const clientIds: string[] = []
	let skipped = 0
	for (const row of picked) {
		if (!row.importable) {
			skipped++
			errors.push(`${row.email}: ${row.uuid ? "این UUID را کلاینت دیگری در پنل دارد" : "شناسهٔ کلاینت روی پنل خالی است"}`)
			continue
		}
		try {
			const client = await prisma.client.create({
				data: {
					adminId: actor.id,
					name: sanitizeConfigName(row.email) || row.email.slice(0, 60),
					uuid: row.uuid,
					subToken: randomToken(18),
					trafficLimit: BigInt(row.totalBytes),
					expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
					ipLimit: row.limitIp,
					telegramId: row.tgId || null,
					note: row.pendingDays > 0 ? withPendingNote(IMPORT_NOTE, row.pendingDays) : IMPORT_NOTE,
					status: row.enable ? "ACTIVE" : "DISABLED",
				},
			})
			// a panel client with a negative expiry has not started its period yet
			if (row.pendingDays > 0) await setPendingStart(client.id, row.pendingDays)
			const now = new Date()
			// usage belongs to the first link only - the others mirror one remote client
			await prisma.clientServer.createMany({
				data: row.inboundIds.map((inboundId, i) => ({
					clientId: client.id,
					serverId,
					inboundId,
					remoteEmail: row.email,
					up: i === 0 ? BigInt(row.up) : 0n,
					down: i === 0 ? BigInt(row.down) : 0n,
					enabled: row.enable,
					lastSyncAt: now,
				})),
			})
			await recomputeClient(client.id)
			clientIds.push(client.id)
		} catch (err) {
			skipped++
			errors.push(`${row.email}: ${err instanceof Error ? err.message : String(err)}`)
		}
	}
	await audit(actor.id, "server.import_clients", serverId, { imported: clientIds.length, skipped, errors: errors.length })
	return { imported: clientIds.length, skipped, errors, clientIds }
}
