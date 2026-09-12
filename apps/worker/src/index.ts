/**
 * SRPanel worker: panel sync, status enforcement, incidents, reminders, backups, webhooks, Telegram bot.
 */
process.env.TZ ??= process.env.SRP_TZ || "Asia/Tehran"

import { Cron } from "croner"
import { prisma } from "@srpanel/db"
import {
	activatePendingStarts,
	autoRefreshRates,
	autoSyncBankDeposits,
	backupDueNow,
	dispatchWebhooks,
	enforceClientStatuses,
	ensureOwner,
	evaluateIncidents,
	expirePayments,
	pollTelegram,
	pruneHistory,
	runBackup,
	runReminders,
	syncServer,
	verifyPendingUsdt,
} from "@srpanel/core"

const INTERVAL = Math.max(20, Number(process.env.SRP_SYNC_INTERVAL_SEC || 60))
const log = (msg: string) => console.log(`[worker ${new Date().toISOString()}] ${msg}`)
const warn = (msg: string, err: unknown) => console.error(`[worker ${new Date().toISOString()}] ${msg}:`, err instanceof Error ? err.message : err)

let syncing = false
async function syncAll() {
	if (syncing) return
	syncing = true
	try {
		const servers = await prisma.server.findMany({ where: { isActive: true }, select: { id: true, name: true } })
		const results = await Promise.allSettled(servers.map((s) => syncServer(s.id)))
		const ok = results.filter((r) => r.status === "fulfilled" && r.value.ok).length
		log(`sync: ${ok}/${servers.length} servers ok`)
		const inc = await evaluateIncidents()
		if (inc.opened || inc.resolved) log(`incidents: +${inc.opened} / -${inc.resolved}`)
	} catch (err) {
		warn("sync failed", err)
	} finally {
		syncing = false
	}
}

async function enforce() {
	try {
		const n = await enforceClientStatuses()
		if (n) log(`expired ${n} clients`)
	} catch (err) {
		warn("enforce failed", err)
	}
}

/** "Start after first use": writes the real expiry once the customer connects. */
async function delayedStarts() {
	try {
		const n = await activatePendingStarts()
		if (n) log(`delayed start: activated ${n} client(s)`)
	} catch (err) {
		warn("delayed start failed", err)
	}
}

async function reminders() {
	try {
		const r = await runReminders()
		if (r.expiry || r.traffic || r.admins) log(`reminders: expiry=${r.expiry} traffic=${r.traffic} admins=${r.admins}`)
	} catch (err) {
		warn("reminders failed", err)
	}
}

async function scheduledBackup() {
	try {
		if (await backupDueNow()) {
			const b = await runBackup("schedule")
			log(`backup ${b.status}: ${b.fileName}${b.error ? ` (${b.error})` : ""}`)
		}
	} catch (err) {
		warn("backup failed", err)
	}
}

async function webhooks() {
	try {
		await dispatchWebhooks()
	} catch (err) {
		warn("webhook dispatch failed", err)
	}
}

/** AUTO pricing: keeps each seller's cached USDT rate inside its TTL. */
async function refreshRates() {
	try {
		const n = await autoRefreshRates()
		if (n) log(`fx: refreshed ${n} seller rate(s)`)
	} catch (err) {
		warn("fx refresh failed", err)
	}
}

/** Card-to-card auto verification through the optional bank bridge. */
async function bankDeposits() {
	try {
		const n = await autoSyncBankDeposits()
		if (n) log(`bank: synced ${n} seller statement(s)`)
	} catch (err) {
		warn("bank sync failed", err)
	}
}

async function main() {
	await ensureOwner()
	log(`started (sync every ${INTERVAL}s, TZ=${process.env.TZ})`)
	const jobs = [
		new Cron(`*/${INTERVAL} * * * * *`, { protect: true }, syncAll),
		new Cron("0 */5 * * * *", { protect: true }, enforce),
		new Cron("0 7 * * * *", { protect: true }, reminders),
		new Cron("0 15 * * * *", { protect: true }, scheduledBackup),
		new Cron("*/20 * * * * *", { protect: true }, webhooks),
		new Cron("0 30 3 * * *", { protect: true }, () => pruneHistory().catch((err) => warn("prune failed", err))),
		// stage 2B — store
		new Cron("30 * * * * *", { protect: true }, () => expirePayments().then((n) => n && log(`expired ${n} payment(s)`)).catch((err) => warn("expirePayments failed", err))),
		new Cron("10 */2 * * * *", { protect: true }, () => verifyPendingUsdt().then((n) => n && log(`auto-confirmed ${n} USDT payment(s)`)).catch((err) => warn("verifyPendingUsdt failed", err))),
		// automatic FX rate + card-to-card bank bridge
		new Cron("20 */2 * * * *", { protect: true }, refreshRates),
		new Cron("40 */2 * * * *", { protect: true }, bankDeposits),
		// delayed start ("start after first use")
		new Cron("50 * * * * *", { protect: true }, delayedStarts),
	]
	const botAbort = new AbortController()
	const bot = pollTelegram(botAbort.signal, log).catch((err) => warn("telegram bot stopped", err))

	await syncAll()
	await enforce()
	await delayedStarts()
	await refreshRates()

	const stop = async () => {
		log("stopping…")
		jobs.forEach((j) => j.stop())
		botAbort.abort()
		await Promise.race([bot, new Promise((r) => setTimeout(r, 3000))])
		await prisma.$disconnect()
		process.exit(0)
	}
	process.on("SIGINT", stop)
	process.on("SIGTERM", stop)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
