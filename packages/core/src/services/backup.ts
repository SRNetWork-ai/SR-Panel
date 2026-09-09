/**
 * Database backups: pg_dump | gzip -> SRP_BACKUP_DIR, retention, optional Telegram upload.
 * Restore: gunzip -c <file> | docker compose exec -T db psql -U srpanel srpanel
 */
import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { mkdir, readdir, stat, unlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import { createGzip } from "node:zlib"
import { prisma, type Backup } from "@srpanel/db"
import { formatBytes } from "../util/bytes"
import { NotFoundError } from "../util/errors"
import { fmtDate, notify } from "./notifications"
import { brandName, getBackupSettings, getTelegramSettings } from "./settings"
import { tgSendDocument } from "./telegram"
import { emitEvent } from "./webhooks"

export const backupDir = () => resolve(process.env.SRP_BACKUP_DIR || "backups")

const safeName = /^[a-zA-Z0-9._-]+$/

function stamp(d = new Date()): string {
	const p = (n: number) => String(n).padStart(2, "0")
	return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function pgDumpToGzip(databaseUrl: string, outFile: string): Promise<void> {
	return new Promise((res, rej) => {
		const child = spawn("pg_dump", ["--no-owner", "--no-privileges", "--clean", "--if-exists", "--dbname", databaseUrl], { stdio: ["ignore", "pipe", "pipe"] })
		const gz = createGzip({ level: 6 })
		const out = createWriteStream(outFile)
		let stderr = ""
		child.stderr.on("data", (b) => (stderr += b.toString()))
		child.on("error", (err) => rej(new Error(`pg_dump: ${err.message}`)))
		out.on("error", rej)
		out.on("finish", () => {
			if (child.exitCode === 0) res()
			else rej(new Error(`pg_dump exited with ${child.exitCode}: ${stderr.slice(-400)}`))
		})
		child.stdout.pipe(gz).pipe(out)
	})
}

let running = false

/** Runs a backup now. `trigger` = "schedule" | "manual" | "telegram". */
export async function runBackup(trigger = "manual"): Promise<Backup> {
	if (running) throw new Error("backup already running")
	running = true
	const dir = backupDir()
	await mkdir(dir, { recursive: true })
	const fileName = `srpanel-${stamp()}.sql.gz`
	const row = await prisma.backup.create({ data: { fileName, trigger } })
	try {
		const url = (process.env.DATABASE_URL || "").replace(/\?.*$/, "")
		if (!url) throw new Error("DATABASE_URL not set")
		const file = join(dir, fileName)
		await pgDumpToGzip(url, file)
		const size = (await stat(file)).size
		let sent = false
		const [bs, ts] = await Promise.all([getBackupSettings(), getTelegramSettings()])
		if (bs.sendToTelegram && ts.enabled && ts.notifyBackups && ts.botToken && ts.chatId) {
			const r = await tgSendDocument(file, `🗄 <b>بکاپ دیتابیس ${brandName()}</b>\n📁 <code>${fileName}</code>\n📊 ${formatBytes(size)}\n🕒 ${fmtDate(new Date())}`)
			sent = r.ok
			if (!r.ok) console.error("[srpanel] backup upload failed:", r.error)
		}
		const done = await prisma.backup.update({ where: { id: row.id }, data: { status: "OK", sizeBytes: BigInt(size), sentToTelegram: sent, finishedAt: new Date() } })
		await applyRetention(bs.keepLast)
		await emitEvent(null, "backup.completed", { backup: { id: done.id, fileName, sizeBytes: size, trigger, sentToTelegram: sent } })
		return done
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		const failed = await prisma.backup.update({ where: { id: row.id }, data: { status: "FAILED", error: message.slice(0, 1000), finishedAt: new Date() } })
		await notify("backup.failed", `❌ <b>بکاپ ناموفق</b>\n<code>${message.slice(0, 300).replace(/[<>&]/g, " ")}</code>`, { dedupeKey: `backup.failed:${row.id}`, recipients: { ownerOnly: true } })
		await emitEvent(null, "backup.failed", { backup: { id: row.id, fileName, error: message } })
		return failed
	} finally {
		running = false
	}
}

async function applyRetention(keepLast: number): Promise<void> {
	const ok = await prisma.backup.findMany({ where: { status: "OK" }, orderBy: { at: "desc" }, skip: keepLast })
	for (const b of ok) await deleteBackup(b.id).catch(() => undefined)
	// remove FAILED rows older than 30 days
	await prisma.backup.deleteMany({ where: { status: "FAILED", at: { lt: new Date(Date.now() - 30 * 86_400_000) } } })
}

export async function listBackups(take = 50) {
	const items = await prisma.backup.findMany({ orderBy: { at: "desc" }, take })
	let diskFiles = 0
	let diskBytes = 0
	try {
		const dir = backupDir()
		for (const f of await readdir(dir)) {
			if (!f.endsWith(".sql.gz")) continue
			diskFiles++
			diskBytes += (await stat(join(dir, f))).size
		}
	} catch {
		/* dir may not exist yet */
	}
	return { items, disk: { files: diskFiles, bytes: diskBytes, dir: backupDir() }, running }
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
	if (safeName.test(b.fileName)) await unlink(join(backupDir(), b.fileName)).catch(() => undefined)
	await prisma.backup.delete({ where: { id } })
}

/** Worker: true when a scheduled backup should run now (daily at settings.hour, local TZ). */
export async function backupDueNow(): Promise<boolean> {
	const s = await getBackupSettings()
	if (!s.enabled || running) return false
	const now = new Date()
	if (now.getHours() !== s.hour) return false
	const start = new Date(now)
	start.setHours(0, 0, 0, 0)
	const today = await prisma.backup.count({ where: { at: { gte: start }, status: { in: ["OK", "RUNNING"] }, trigger: "schedule" } })
	return today === 0
}
