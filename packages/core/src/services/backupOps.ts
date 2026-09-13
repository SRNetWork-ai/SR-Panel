/**
 * Backup operations that are either dangerous (restore) or purely diagnostic (health).
 * Separated from ./backup so the dump path never imports the restore path.
 */
import { spawn } from "node:child_process"
import { createReadStream } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { createGunzip } from "node:zlib"
import { prisma } from "@srpanel/db"
import { AppError } from "../util/errors"
import { notify } from "./notifications"
import { type BackupSettings, getBackupSettings } from "./settings"
import { emitEvent } from "./webhooks"
import { DUMP_EXT, backupDir, backupFilePath, backupTimes, inspectFile, isBackupRunning, isRestoring, markRestoring, nextRunAt, readMeta, reindexBackups, runBackup } from "./backup"

export type RestoreResult = { fileName: string; safetyBackupId: string | null; durationMs: number; imported: number }

export type BackupHealth = {
	settings: BackupSettings
	times: number[]
	nextRunAt: string | null
	running: boolean
	restoring: boolean
	total: number
	okCount: number
	failed7d: number
	lastOk: { id: string; at: string; fileName: string; sizeBytes: number | null } | null
	lastFail: { id: string; at: string; error: string | null } | null
	/** hours since the newest OK backup */
	ageHours: number | null
	stale: boolean
	disk: { files: number; bytes: number; dir: string; ok: boolean }
	/** dump files with no OK row */
	orphanFiles: string[]
	/** OK rows whose file is gone */
	missingFiles: string[]
	lastCheck: { at: string; ok: boolean; fileName: string; error: string } | null
}

/** Frees the database from every other client so the dump can DROP/CREATE freely. */
async function terminateOtherSessions(): Promise<void> {
	try {
		await prisma.$queryRawUnsafe("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()")
	} catch (err) {
		console.error("[srpanel] restore: could not terminate sessions:", err)
	}
}

/** gunzip <file> | psql -v ON_ERROR_STOP=1 */
function psqlRestore(databaseUrl: string, file: string): Promise<void> {
	return new Promise((res, rej) => {
		const child = spawn("psql", ["--quiet", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "--dbname", databaseUrl, "-f", "-"], { stdio: ["pipe", "ignore", "pipe"] })
		let stderr = ""
		let settled = false
		const done = (err?: Error) => {
			if (settled) return
			settled = true
			if (err) rej(err)
			else res()
		}
		child.stderr.on("data", (b) => (stderr += b.toString()))
		child.on("error", (err) => done(new Error(`psql: ${err.message}`)))
		child.on("close", (code) => done(code === 0 ? undefined : new Error(`psql exited with ${code}: ${stderr.slice(-600)}`)))
		child.stdin.on("error", () => undefined)
		child.stdin.write("SET lock_timeout = '45s';\nSET statement_timeout = 0;\n")
		const raw = createReadStream(file)
		const gunzip = createGunzip()
		raw.on("error", (err) => done(err))
		gunzip.on("error", (err) => done(err))
		raw.pipe(gunzip).pipe(child.stdin)
	})
}

/**
 * Restores the panel database from one of its own backups.
 * Order: integrity check -> safety backup -> kick other sessions -> psql -> reindex rows.
 * The caller must confirm by typing the exact file name.
 */
export async function restoreBackup(id: string, opts: { confirmFileName: string; safetyBackup?: boolean }): Promise<RestoreResult> {
	if (isRestoring()) throw new AppError("یک بازگردانی در جریان است", 409, "restore_running")
	if (isBackupRunning()) throw new AppError("بکاپ‌گیری در جریان است؛ پس از پایان آن دوباره تلاش کنید", 409, "backup_running")
	const { path, backup } = await backupFilePath(id)
	if (opts.confirmFileName.trim() !== backup.fileName) throw new AppError("نام فایل واردشده با بکاپ انتخابی یکسان نیست", 400, "confirm_mismatch")
	const url = (process.env.DATABASE_URL || "").replace(/\?.*$/, "")
	if (!url) throw new AppError("DATABASE_URL تنظیم نشده است", 500, "no_database_url")
	const check = await inspectFile(backup.fileName)
	if (!check.ok) throw new AppError(`این بکاپ سالم نیست و بازگردانی نشد: ${check.error || "invalid dump"}`, 400, "backup_invalid")
	let safetyBackupId: string | null = null
	if (opts.safetyBackup !== false) {
		const safety = await runBackup("pre-restore", { protectIds: [id] })
		if (safety.status !== "OK") throw new AppError(`بکاپ ایمنی پیش از بازگردانی ناموفق بود: ${safety.error || ""}`.trim(), 500, "safety_failed")
		safetyBackupId = safety.id
	}
	const startedAt = Date.now()
	markRestoring(true)
	try {
		await terminateOtherSessions()
		await psqlRestore(url, path)
	} catch (err) {
		markRestoring(false)
		const message = err instanceof Error ? err.message : String(err)
		await notify("backup.restore.failed", `❌ <b>بازگردانی ناموفق</b>\n<code>${backup.fileName}</code>\n${message.slice(0, 300).replace(/[<>&]/g, " ")}`, { dedupeKey: `restore.failed:${id}`, recipients: { ownerOnly: true } })
		await emitEvent(null, "backup.restore.failed", { backup: { id, fileName: backup.fileName, error: message } })
		throw new AppError(`بازگردانی ناموفق بود: ${message.slice(0, 300)}`, 500, "restore_failed")
	}
	markRestoring(false)
	const durationMs = Date.now() - startedAt
	const reindex = await reindexBackups().catch(() => ({ imported: 0 }))
	const seconds = Math.max(1, Math.round(durationMs / 1000))
	await notify("backup.restored", `♻️ <b>دیتابیس بازگردانده شد</b>\n<code>${backup.fileName}</code>\n⏱ ${seconds}s`, { dedupeKey: `restore.ok:${id}:${startedAt}`, recipients: { ownerOnly: true } })
	await emitEvent(null, "backup.restored", { backup: { id, fileName: backup.fileName, safetyBackupId, durationMs } })
	return { fileName: backup.fileName, safetyBackupId, durationMs, imported: reindex.imported }
}

/** Everything the backups page needs to tell the owner whether backups are actually healthy. */
export async function backupHealth(): Promise<BackupHealth> {
	const s = await getBackupSettings()
	const now = Date.now()
	const [total, okCount, failed7d, lastOkRow, lastFailRow, okRows] = await Promise.all([
		prisma.backup.count(),
		prisma.backup.count({ where: { status: "OK" } }),
		prisma.backup.count({ where: { status: "FAILED", at: { gte: new Date(now - 7 * 86_400_000) } } }),
		prisma.backup.findFirst({ where: { status: "OK" }, orderBy: { at: "desc" } }),
		prisma.backup.findFirst({ where: { status: "FAILED" }, orderBy: { at: "desc" } }),
		prisma.backup.findMany({ where: { status: "OK" }, select: { fileName: true } }),
	])
	const dir = backupDir()
	let files: string[] = []
	let dirOk = true
	try {
		files = await readdir(dir)
	} catch {
		dirOk = false
	}
	const dumps = files.filter((f) => f.endsWith(DUMP_EXT))
	let bytes = 0
	for (const f of dumps) {
		const st = await stat(join(dir, f)).catch(() => null)
		if (st) bytes += st.size
	}
	const known = new Set(okRows.map((b) => b.fileName))
	const onDisk = new Set(dumps)
	const orphanFiles = dirOk ? dumps.filter((f) => !known.has(f)) : []
	const missingFiles = dirOk ? [...known].filter((f) => !onDisk.has(f)) : []
	const ageHours = lastOkRow ? Math.round(((now - lastOkRow.at.getTime()) / 3_600_000) * 10) / 10 : null
	const stale = s.enabled && s.staleAfterHours > 0 && (ageHours === null || ageHours > s.staleAfterHours)
	const meta = lastOkRow ? await readMeta(lastOkRow.fileName) : null
	const next = nextRunAt(s)
	return {
		settings: s,
		times: backupTimes(s),
		nextRunAt: next ? next.toISOString() : null,
		running: isBackupRunning(),
		restoring: isRestoring(),
		total,
		okCount,
		failed7d,
		lastOk: lastOkRow ? { id: lastOkRow.id, at: lastOkRow.at.toISOString(), fileName: lastOkRow.fileName, sizeBytes: lastOkRow.sizeBytes === null ? null : Number(lastOkRow.sizeBytes) } : null,
		lastFail: lastFailRow ? { id: lastFailRow.id, at: lastFailRow.at.toISOString(), error: lastFailRow.error } : null,
		ageHours,
		stale,
		disk: { files: dumps.length, bytes, dir, ok: dirOk },
		orphanFiles: orphanFiles.slice(0, 20),
		missingFiles: missingFiles.slice(0, 20),
		lastCheck: meta?.lastCheckAt && lastOkRow ? { at: meta.lastCheckAt, ok: meta.lastCheckOk === true, fileName: lastOkRow.fileName, error: meta.lastCheckError ?? "" } : null,
	}
}
