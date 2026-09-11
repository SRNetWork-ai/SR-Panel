import { randomBytes } from "node:crypto"
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { AppError } from "../util/errors"

/**
 * In-panel updates.
 *
 * The panel itself runs inside Docker, so it cannot rebuild its own containers.
 * Instead the host runs a tiny root agent (scripts/sr-agent.sh, systemd unit
 * srpanel-agent) that watches a shared directory ($SRP_DIR/state, mounted here
 * as /app/state) and performs "check" / "update" jobs. This service only writes
 * the request file and reads the agent's heartbeat, job status and log — so the
 * owner can update the panel from the web UI without ever opening SSH.
 */
export const UPDATE_STATE_DIR = process.env.SRP_STATE_DIR || "/app/state"
const UPDATE_DIR = join(UPDATE_STATE_DIR, "update")
const AGENT_FILE = join(UPDATE_STATE_DIR, "agent.json")
const REQUEST_FILE = join(UPDATE_DIR, "request.json")
const STATUS_FILE = join(UPDATE_DIR, "status.json")
const LATEST_FILE = join(UPDATE_DIR, "latest.json")
const LOG_FILE = join(UPDATE_DIR, "update.log")

const AGENT_ONLINE_MS = 45_000
const JOB_STALE_MS = 40 * 60_000
const LOG_MAX_BYTES = 120_000

export type UpdateAgent = {
	agentVersion: string
	pid?: number
	at: string
	dir: string
	branch: string
	commit: string
	version: string
	poll?: number
}
export type UpdateJobState = "idle" | "queued" | "checking" | "running" | "success" | "failed"
export type UpdateJob = {
	id: string
	state: UpdateJobState
	step: string
	at: string
	startedAt: string
	finishedAt: string
	fromCommit: string
	toCommit: string
	fromVersion: string
	toVersion: string
	agentVersion?: string
	error: string | null
}
export type UpdateLatest = {
	checkedAt: string
	localCommit: string
	localVersion: string
	remoteCommit: string
	remoteVersion: string
	behind: number
	subject: string
	error: string | null
}
export type UpdatePending = { id: string; action: "check" | "update"; requestedAt: string; requestedBy?: string | null }
export type UpdateOverview = {
	version: string
	commit: string | null
	branch: string | null
	agent: (UpdateAgent & { online: boolean; ageSec: number }) | null
	job: UpdateJob | null
	latest: UpdateLatest | null
	pending: UpdatePending | null
	busy: boolean
	updateAvailable: boolean
	stateDir: string
}

async function readJson<T>(file: string): Promise<T | null> {
	try {
		return JSON.parse(await readFile(file, "utf8")) as T
	} catch {
		return null
	}
}

let cachedVersion: string | null = null
/** Version of the running build (apps/web/package.json inside the image). */
export async function panelVersion(): Promise<string> {
	if (cachedVersion) return cachedVersion
	if (process.env.SRP_VERSION) {
		cachedVersion = process.env.SRP_VERSION
		return cachedVersion
	}
	for (const file of ["apps/web/package.json", "package.json"]) {
		const pkg = await readJson<{ version?: string }>(join(process.cwd(), file))
		if (pkg?.version) {
			cachedVersion = pkg.version
			return cachedVersion
		}
	}
	return "0.0.0"
}

function jobIsFresh(job: UpdateJob | null): boolean {
	if (!job) return false
	const at = Date.parse(job.at || job.startedAt || "")
	return Number.isFinite(at) && Date.now() - at < JOB_STALE_MS
}

function jobIsBusy(job: UpdateJob | null): boolean {
	return !!job && (job.state === "running" || job.state === "checking" || job.state === "queued") && jobIsFresh(job)
}

export async function getUpdateOverview(): Promise<UpdateOverview> {
	const [agentRaw, job, latest, pending, version] = await Promise.all([
		readJson<UpdateAgent>(AGENT_FILE),
		readJson<UpdateJob>(STATUS_FILE),
		readJson<UpdateLatest>(LATEST_FILE),
		readJson<UpdatePending>(REQUEST_FILE),
		panelVersion(),
	])
	let agent: UpdateOverview["agent"] = null
	if (agentRaw?.at) {
		const ageMs = Date.now() - Date.parse(agentRaw.at)
		agent = {
			...agentRaw,
			online: Number.isFinite(ageMs) && ageMs < AGENT_ONLINE_MS,
			ageSec: Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 1000)) : 0,
		}
	}
	return {
		version,
		commit: agentRaw?.commit || latest?.localCommit || null,
		branch: agentRaw?.branch || null,
		agent,
		job,
		latest,
		pending: pending ?? null,
		busy: jobIsBusy(job) || !!pending,
		updateAvailable: (latest?.behind ?? 0) > 0,
		stateDir: UPDATE_STATE_DIR,
	}
}

/** Queues a job for the host agent. Throws a friendly AppError when it cannot run. */
export async function requestUpdateJob(action: "check" | "update", adminId?: string | null): Promise<UpdatePending> {
	const overview = await getUpdateOverview()
	if (!overview.agent) {
		throw new AppError("سرویس به‌روزرسانی روی سرور نصب نیست — یک‌بار روی سرور دستور SR agent install را اجرا کنید.", 409, "agent_missing")
	}
	if (!overview.agent.online) {
		throw new AppError(`سرویس به‌روزرسانی سرور پاسخ نمی‌دهد (آخرین ضربان: ${overview.agent.ageSec} ثانیه پیش) — دستور SR agent restart را اجرا کنید.`, 409, "agent_offline")
	}
	if (overview.pending) throw new AppError("یک درخواست در صف است؛ چند لحظه صبر کنید.", 409, "update_queued")
	if (jobIsBusy(overview.job)) throw new AppError("یک به‌روزرسانی در حال اجراست.", 409, "update_running")

	const pending: UpdatePending = {
		id: `${action === "update" ? "upd" : "chk"}_${randomBytes(6).toString("hex")}`,
		action,
		requestedAt: new Date().toISOString(),
		requestedBy: adminId ?? null,
	}
	await mkdir(UPDATE_DIR, { recursive: true })
	const tmp = `${REQUEST_FILE}.tmp`
	await writeFile(tmp, JSON.stringify(pending), "utf8")
	await rename(tmp, REQUEST_FILE)
	return pending
}

export async function cancelUpdateRequest(): Promise<void> {
	try {
		await unlink(REQUEST_FILE)
	} catch {
		/* the agent already picked it up */
	}
}

/** Incremental log reader for the live console in the UI. */
export async function readUpdateLog(offset = 0): Promise<{ size: number; offset: number; chunk: string; state: UpdateJobState; step: string }> {
	const job = await readJson<UpdateJob>(STATUS_FILE)
	let buf: Buffer
	try {
		buf = await readFile(LOG_FILE)
	} catch {
		return { size: 0, offset: 0, chunk: "", state: job?.state ?? "idle", step: job?.step ?? "" }
	}
	let from = Number.isFinite(offset) && offset > 0 ? offset : 0
	if (from > buf.length) from = 0
	if (buf.length - from > LOG_MAX_BYTES) from = buf.length - LOG_MAX_BYTES
	return { size: buf.length, offset: from, chunk: buf.subarray(from).toString("utf8"), state: job?.state ?? "idle", step: job?.step ?? "" }
}
