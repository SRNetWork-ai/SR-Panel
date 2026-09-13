/**
 * Database backups: pg_dump | gzip -> SRP_BACKUP_DIR.
 * Every dump gets a `<file>.meta.json` sidecar (sha256, size, table count, last check)
 * so integrity data needs no schema change. Restore/health live in ./backupOps
 */
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { createGunzip, createGzip } from "node:zlib"
import { prisma, type Backup } from "@srpanel/db"
import { formatBytes } from "../util/bytes"
import { NotFoundError } from "../util/errors"
import { fmtDate, notify } from "./notifications"
import { type BackupSettings, brandName, getBackupSettings, getTelegramSettings } from "./settings"
import { tgSendDocument } from "./telegram"
import { emitEvent } from "./webhooks"

export const backupDir = () => resolve(process.env.SRP_BACKUP_DIR || "backups")

/** the worker cron fires at minute 15 of every hour */
export const SCHEDULE_MINUTE = 15
export const DUMP_EXT = ".sql.gz"
const META_EXT = ".meta.json"
const safeName = /^[a-zA-Z0-9._-]+$/

export type BackupMeta = {
	sha256: string
	sizeBytes: number
	createdAt: string
	trigger: string
	tables: number
	copyBlocks: number
	lastCheckAt?: string
	lastCheckOk?: boolean
	lastCheckError?: string
}

export type BackupCheck = {
	fileName: string
	ok: boolean
	sizeBytes: number
	sha256: string
	tables: number
	copyBlocks: number
	gzipOk: boolean
	/** null = no stored checksum to compare with */
	sha256Match: boolean | null
	error?: string
}

const state = { running: false, restoring: false }

export const isBackupRunning = () => state.running
export const isRestoring = () => state.restoring
/** used by ./backupOps while a restore is in flight */
export const markRestoring = (v: boolean) => {
	state.restoring = v
}

function stamp(d = new Date()): string {
	const p = (n: number) => String(n).padStart(2, "0")
	return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

const metaFile = (fileName: string) => join(backupDir(), fileName + META_EXT)

export async function readMeta(fileName: string): Promise<BackupMeta | null> {
	if (!safeName.test(fileName)) return null
	try {
		const parsed = JSON.parse(await readFile(metaFile(fileName), "utf8")) as BackupMeta
		return parsed && typeof parsed.sha256 === "string" ? parsed : null
	} catch {
		return null
	}
}

async function writeMeta(fileName: string, meta: BackupMeta): Promise<void> {
	try {
		await writeFile(metaFile(fileName), `${JSON.stringify(meta, null, 2)}\n`, "utf8")
	} catch (err) {
		console.error("[srpanel] backup meta write failed:", err)
	}
}

/** pg_dump -> gzip file, hashing the compressed bytes on the way out. */
function pgDumpToGzip(databaseUrl: string, outFile: string): Promise<{ size: number; sha256: string }> {
	return new Promise((res, rej) => {
		const child = spawn("pg_dump", ["--no-owner", "--no-privileges", "--clean", "--if-exists", "--dbname", databaseUrl], { stdio: ["ignore", "pipe", "pipe"] })
		const gz = createGzip({ level: 6 })
		const out = createWriteStream(outFile)
		const hash = createHash("sha256")
		let size = 0
		let stderr = ""
		child.stderr.on("data", (b) => (stderr += b.toString()))
		child.on("error", (err) => rej(new Error(`pg_dump: ${err.message}`)))
		gz.on("data", (c: Buffer) => {
			size += c.length
			hash.update(c)
		})
		gz.on("error", rej)
		out.on("error", rej)
		out.on("finish", () => {
			if (child.exitCode === 0) res({ size, sha256: hash.digest("hex") })
			else rej(new Error(`pg_dump exited with ${child.exitCode}: ${stderr.slice(-400)}`))
		})
		child.stdout.pipe(gz).pipe(out)
	})
}

/** Streams the gzip through gunzip: proves it decompresses and counts the SQL landmarks. */
export async function scanDump(file: string): Promise<{ gzipOk: boolean; tables: number; copyBlocks: number; sha256: string; sizeBytes: number; error?: string }> {
	const hash = createHash("sha256")
	let sizeBytes = 0
	let tables = 0
	let copyBlocks = 0
	const count = (line: string) => {
		if (line.startsWith("COPY ")) copyBlocks++
		else if (line.startsWith("CREATE TABLE")) tables++
	}
	const raw = createReadStream(file)
	raw.on("data", (c) => {
		const buf = c as Buffer
		sizeBytes += buf.length
		hash.update(buf)
	})
	const gunzip = createGunzip()
	raw.pipe(gunzip)
	try {
		let leftover = ""
		for await (const chunk of gunzip) {
			const text = leftover + (chunk as Buffer).toString("latin1")
			const lines = text.split("\n")
			leftover = lines.pop() ?? ""
			for (const line of lines) count(line)
		}
		if (leftover) count(leftover)
		return { gzipOk: true, tables, copyBlocks, sha256: hash.digest("hex"), sizeBytes }
	} catch (err) {
		raw.destroy()
		return { gzipOk: false, tables, copyBlocks, sha256: "", sizeBytes, error: err instanceof Error ? err.message : String(err) }
	}
}

/** Full integrity check of one dump file (gzip + content + stored checksum). */
export async function inspectFile(fileName: string): Promise<BackupCheck> {
	const scan = await scanDump(join(backupDir(), fileName))
	const meta = await readMeta(fileName)
	const sha256Match: boolean | null = meta?.sha256 ? meta.sha256 === scan.sha256 : null
	const ok = scan.gzipOk && scan.tables > 0 && sha256Match !== false
	let error = scan.error
	if (!error && sha256Match === false) error = "sha256 mismatch"
	if (!error && scan.gzipOk && scan.tables === 0) error = "no CREATE TABLE statement found"
	return { fileName, ok, sizeBytes: scan.sizeBytes, sha256: scan.sha256, tables: scan.tables, copyBlocks: scan.copyBlocks, gzipOk: scan.gzipOk, sha256Match, error }
}

/** Verifies a stored backup and records the result in its sidecar. */
export async function verifyBackup(id: string): Promise<BackupCheck> {
	const { backup } = await backupFilePath(id)
	const check = await inspectFile(backup.fileName)
	const meta = await readMeta(backup.fileName)
	const base: BackupMeta = meta ?? {
		sha256: check.sha256,
		sizeBytes: check.sizeBytes,
		createdAt: backup.at.toISOString(),
		trigger: backup.trigger,
		tables: check.tables,
		copyBlocks: check.copyBlocks,
	}
	await writeMeta(backup.fileName, { ...base, lastCheckAt: new Date().toISOString(), lastCheckOk: check.ok, lastCheckError: check.error ?? "" })
	if (!check.ok) {
		const why = (check.error || "invalid dump").slice(0, 200).replace(/[<>&]/g, " ")
		await notify("backup.unhealthy", `⚠️ <b>بکاپ سالم نیست</b>\n<code>${backup.fileName}</code>\n${why}`, { dedupeKey: `backup.check:${backup.id}`, recipients: { ownerOnly: true } })
	}
	return check
}

/** Runs a backup now. `trigger` = "schedule" | "manual" | "telegram" | "pre-restore". */
export async function runBackup(trigger = "manual", opts: { protectIds?: string[] } = {}): Promise<Backup> {
	if (state.running) throw new Error("backup already running")
	if (state.restoring) throw new Error("restore in progress")
	state.running = true
	const dir = backupDir()
	await mkdir(dir, { recursive: true })
	const fileName = `srpanel-${stamp()}${DUMP_EXT}`
	const row = await prisma.backup.create({ data: { fileName, trigger } })
	try {
		const url = (process.env.DATABASE_URL || "").replace(/\?.*$/, "")
		if (!url) throw new Error("DATABASE_URL not set")
		const file = join(dir, fileName)
		const { size, sha256 } = await pgDumpToGzip(url, file)
		const [bs, ts] = await Promise.all([getBackupSettings(), getTelegramSettings()])
		let check: BackupCheck | null = null
		if (bs.verify) {
			check = await inspectFile(fileName)
			if (!check.ok) throw new Error(`verify failed: ${check.error || "invalid dump"}`)
		}
		const nowIso = new Date().toISOString()
		const meta: BackupMeta = {
			sha256,
			sizeBytes: size,
			createdAt: nowIso,
			trigger,
			tables: check?.tables ?? 0,
			copyBlocks: check?.copyBlocks ?? 0,
			lastCheckAt: check ? nowIso : undefined,
			lastCheckOk: check ? check.ok : undefined,
		}
		await writeMeta(fileName, meta)
		let sent = false
		if (bs.sendToTelegram && ts.enabled && ts.notifyBackups && ts.botToken && ts.chatId) {
			const r = await tgSendDocument(file, `🗄 <b>بکاپ دیتابیس ${brandName()}</b>\n📁 <code>${fileName}</code>\n📊 ${formatBytes(size)}\n🔐 <code>${sha256.slice(0, 12)}</code>\n🕒 ${fmtDate(new Date())}`)
			sent = r.ok
			if (!r.ok) console.error("[srpanel] backup upload failed:", r.error)
		}
		const done = await prisma.backup.update({ where: { id: row.id }, data: { status: "OK", sizeBytes: BigInt(size), sentToTelegram: sent, finishedAt: new Date() } })
		await applyRetention(bs, [row.id, ...(opts.protectIds ?? [])])
		if (bs.autoCleanup) await cleanupBackups().catch(() => undefined)
		await emitEvent(null, "backup.completed", { backup: { id: done.id, fileName, sizeBytes: size, trigger, sentToTelegram: sent, sha256, tables: meta.tables, verified: check ? check.ok : false } })
		return done
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		await unlink(join(dir, fileName)).catch(() => undefined)
		await unlink(metaFile(fileName)).catch(() => undefined)
		const failed = await prisma.backup.update({ where: { id: row.id }, data: { status: "FAILED", error: message.slice(0, 1000), finishedAt: new Date() } })
		await notify("backup.failed", `❌ <b>بکاپ ناموفق</b>\n<code>${message.slice(0, 300).replace(/[<>&]/g, " ")}</code>`, { dedupeKey: `backup.failed:${row.id}`, recipients: { ownerOnly: true } })
		await emitEvent(null, "backup.failed", { backup: { id: row.id, fileName, error: message } })
		return failed
	} finally {
		state.running = false
	}
}

/** keepLast + keepDays, never touching the newest OK backup or a protected id. */
export async function applyRetention(s: BackupSettings, protectIds: string[] = []): Promise<void> {
	const protect = new Set(protectIds)
	const ok = await prisma.backup.findMany({ where: { status: "OK" }, orderBy: { at: "desc" }, select: { id: true, at: true } })
	const cutoff = s.keepDays > 0 ? Date.now() - s.keepDays * 86_400_000 : 0
	let i = 0
	for (const b of ok) {
		const index = i++
		if (index === 0 || protect.has(b.id)) continue
		const tooMany = index >= s.keepLast
		const tooOld = cutoff > 0 && b.at.getTime() < cutoff
		if (tooMany || tooOld) await deleteBackup(b.id).catch(() => undefined)
	}
	await prisma.backup.deleteMany({ where: { status: "FAILED", at: { lt: new Date(Date.now() - 30 * 86_400_000) } } })
}

/** Housekeeping: crashed RUNNING rows, rows without a file, old failures, orphan sidecars. */
export async function cleanupBackups(): Promise<{ staleRuns: number; missingRows: number; oldFailed: number; sidecars: number }> {
	const dir = backupDir()
	let files: string[] = []
	let dirOk = true
	try {
		files = await readdir(dir)
	} catch {
		dirOk = false
	}
	const dumps = new Set(files.filter((f) => f.endsWith(DUMP_EXT)))
	const stale = await prisma.backup.updateMany({ where: { status: "RUNNING", at: { lt: new Date(Date.now() - 6 * 3_600_000) } }, data: { status: "FAILED", error: "interrupted", finishedAt: new Date() } })
	let missingRows = 0
	if (dirOk) {
		const rows = await prisma.backup.findMany({ where: { status: "OK" }, select: { id: true, fileName: true } })
		const dead = rows.filter((b) => !dumps.has(b.fileName)).map((b) => b.id)
		if (dead.length) {
			const res = await prisma.backup.deleteMany({ where: { id: { in: dead } } })
			missingRows = res.count
		}
	}
	const oldFailed = await prisma.backup.deleteMany({ where: { status: "FAILED", at: { lt: new Date(Date.now() - 30 * 86_400_000) } } })
	let sidecars = 0
	for (const f of files) {
		if (!f.endsWith(META_EXT)) continue
		if (dumps.has(f.slice(0, -META_EXT.length))) continue
		await unlink(join(dir, f)).catch(() => undefined)
		sidecars++
	}
	return { staleRuns: stale.count, missingRows, oldFailed: oldFailed.count, sidecars }
}

/** Imports dump files that have no row yet (e.g. after a restore wiped newer rows). */
export async function reindexBackups(): Promise<{ imported: number }> {
	const dir = backupDir()
	let files: string[] = []
	try {
		files = await readdir(dir)
	} catch {
		return { imported: 0 }
	}
	const dumps = files.filter((f) => f.endsWith(DUMP_EXT) && safeName.test(f))
	if (!dumps.length) return { imported: 0 }
	const rows = await prisma.backup.findMany({ where: { fileName: { in: dumps } }, select: { fileName: true } })
	const known = new Set(rows.map((b) => b.fileName))
	let imported = 0
	for (const f of dumps) {
		if (known.has(f)) continue
		const st = await stat(join(dir, f)).catch(() => null)
		if (!st) continue
		const meta = await readMeta(f)
		const at = meta?.createdAt ? new Date(meta.createdAt) : st.mtime
		await prisma.backup.create({ data: { fileName: f, status: "OK", trigger: "imported", at: Number.isNaN(at.getTime()) ? st.mtime : at, sizeBytes: BigInt(st.size), finishedAt: st.mtime } })
		imported++
	}
	return { imported }
}

export async function listBackups(take = 50) {
	const items = await prisma.backup.findMany({ orderBy: { at: "desc" }, take })
	const dumps = new Set<string>()
	let diskFiles = 0
	let diskBytes = 0
	try {
		const dir = backupDir()
		for (const f of await readdir(dir)) {
			if (!f.endsWith(DUMP_EXT)) continue
			dumps.add(f)
			diskFiles++
			diskBytes += (await stat(join(dir, f))).size
		}
	} catch {
		/* dir may not exist yet */
	}
	const meta: Record<string, BackupMeta> = {}
	const onDisk: string[] = []
	for (const b of items) {
		if (dumps.has(b.fileName)) onDisk.push(b.id)
		const m = await readMeta(b.fileName)
		if (m) meta[b.id] = m
	}
	return { items, disk: { files: diskFiles, bytes: diskBytes, dir: backupDir() }, running: state.running, restoring: state.restoring, meta, onDisk }
}

export async function backupFilePath(id: string): Promise<{ path: string; backup: Backup }> {
	const b = await prisma.backup.findUnique({ where: { id } })
	if (!b || b.status !== "OK" || !safeName.test(b.fileName)) throw new NotFoundError("بکاپ پیدا نشد")
	const path = join(backupDir(), b.fileName)
	await stat(path).catch(() => {
		throw new NotFoundError("فایل بکاپ روی دیسک موجود نیست")
	})
	return { path, backup: b }
}

export async function deleteBackup(id: string): Promise<void> {
	const b = await prisma.backup.findUnique({ where: { id } })
	if (!b) throw new NotFoundError("بکاپ پیدا نشد")
	if (safeName.test(b.fileName)) {
		await unlink(join(backupDir(), b.fileName)).catch(() => undefined)
		await unlink(metaFile(b.fileName)).catch(() => undefined)
	}
	await prisma.backup.delete({ where: { id } })
}

/** All local hours a scheduled backup runs at. */
export function backupTimes(s: BackupSettings): number[] {
	const hours = new Set<number>([s.hour, ...(s.extraHours ?? [])])
	return [...hours].filter((h) => Number.isInteger(h) && h >= 0 && h <= 23).sort((a, b) => a - b)
}

export function nextRunAt(s: BackupSettings, from = new Date()): Date | null {
	if (!s.enabled) return null
	const times = backupTimes(s)
	if (!times.length) return null
	for (let day = 0; day < 2; day++) {
		for (const h of times) {
			const d = new Date(from)
			d.setDate(d.getDate() + day)
			d.setHours(h, SCHEDULE_MINUTE, 0, 0)
			if (d.getTime() > from.getTime()) return d
		}
	}
	return null
}

/** Worker: true when a scheduled backup should run in this hour (local TZ). */
export async function backupDueNow(): Promise<boolean> {
	const s = await getBackupSettings()
	if (!s.enabled || state.running || state.restoring) return false
	const now = new Date()
	if (!backupTimes(s).includes(now.getHours())) return false
	const from = new Date(now)
	from.setMinutes(0, 0, 0)
	const done = await prisma.backup.count({ where: { at: { gte: from }, status: { in: ["OK", "RUNNING"] }, trigger: "schedule" } })
	return done === 0
}
