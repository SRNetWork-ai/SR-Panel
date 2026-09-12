"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { Activity, AlertTriangle, ArrowDownToLine, CheckCircle2, Clock, Copy, Download, RefreshCw, ScrollText, Server, Sparkles, Terminal, XCircle, Zap } from "lucide-react"
import type { UpdateOverview } from "@srpanel/core"
import { ApiError, api, copyText } from "@/lib/client"
import { useLocale } from "@/lib/i18n"
import { Badge, Button, Card, PageHeader, Progress, cx, useConfirm, useToast } from "@/components/ui"

type LogResp = { size: number; offset: number; chunk: string; state: string; step: string }

const STEPS = ["source", "build", "health"] as const
const AGENT_CMD = "SR agent install"
const IDLE_POLL_MS = 30_000
const BUSY_POLL_MS = 2_000

/** Pointer-reactive 3D tilt wrapper (see app/motion3d.css). */
function Tilt({ children, max = 7 }: { children: ReactNode; max?: number }) {
	const ref = useRef<HTMLDivElement | null>(null)
	const move = (e: ReactPointerEvent<HTMLDivElement>) => {
		const el = ref.current
		if (!el) return
		const r = el.getBoundingClientRect()
		const px = (e.clientX - r.left) / r.width
		const py = (e.clientY - r.top) / r.height
		el.style.setProperty("--ry", `${(px - 0.5) * max * 2}deg`)
		el.style.setProperty("--rx", `${(0.5 - py) * max * 2}deg`)
		el.style.setProperty("--mx", `${px * 100}%`)
		el.style.setProperty("--my", `${py * 100}%`)
	}
	const reset = () => {
		const el = ref.current
		if (!el) return
		el.style.setProperty("--ry", "0deg")
		el.style.setProperty("--rx", "0deg")
	}
	return (
		<div ref={ref} className="tilt h-full" onPointerMove={move} onPointerLeave={reset}>
			{children}
		</div>
	)
}

const shortSha = (sha?: string | null) => (sha ? sha.slice(0, 7) : "—")

function clock(totalSec: number): string {
	const s = Math.max(0, Math.round(totalSec))
	const m = Math.floor(s / 60)
	return `${m}:${String(s % 60).padStart(2, "0")}`
}

export function UpdatesClient({ initial }: { initial: UpdateOverview }) {
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)

	const [data, setData] = useState<UpdateOverview>(initial)
	const [log, setLog] = useState("")
	const [live, setLive] = useState<boolean>(initial.busy)
	const [pending, setPending] = useState<"check" | "update" | "cancel" | null>(null)
	const [reconnecting, setReconnecting] = useState(false)
	const [autoscroll, setAutoscroll] = useState(true)
	const [, setTick] = useState(0)
	const offsetRef = useRef(0)
	const logRef = useRef<HTMLPreElement | null>(null)

	const pullLog = useCallback(async () => {
		try {
			const r = await api<LogResp>("/api/system/update/log?offset=" + offsetRef.current)
			if (r.offset < offsetRef.current) setLog(r.chunk)
			else if (r.chunk) setLog((prev) => prev + r.chunk)
			offsetRef.current = r.size
			setReconnecting(false)
		} catch {
			/* the web container restarts while it rebuilds itself - keep polling */
			setReconnecting(true)
		}
	}, [])

	const pull = useCallback(async () => {
		try {
			const next = await api<UpdateOverview>("/api/system/update")
			setData(next)
			setLive(next.busy)
			setReconnecting(false)
		} catch (err) {
			if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return
			setReconnecting(true)
		}
	}, [])

	useEffect(() => {
		void pullLog()
	}, [pullLog])

	// fast polling while a job runs, a slow heartbeat otherwise
	useEffect(() => {
		const id = window.setInterval(() => {
			void pull()
			if (live) void pullLog()
		}, live ? BUSY_POLL_MS : IDLE_POLL_MS)
		return () => window.clearInterval(id)
	}, [live, pull, pullLog])

	// 1s heartbeat so the elapsed timer moves
	useEffect(() => {
		if (!live) return
		const id = window.setInterval(() => setTick((t) => t + 1), 1000)
		return () => window.clearInterval(id)
	}, [live])

	useEffect(() => {
		const el = logRef.current
		if (el && autoscroll) el.scrollTop = el.scrollHeight
	}, [log, autoscroll])

	const send = async (action: "check" | "update") => {
		if (action === "update" && !confirm(L("پنل به آخرین نسخه به\u200cروزرسانی و سرویس\u200cها بازسازی می\u200cشوند و چند دقیقه موقتاً در دسترس نیست. ادامه؟", "The panel will be updated and rebuilt; it goes offline for a few minutes. Continue?"))) return
		setPending(action)
		try {
			await api("/api/system/update", { method: "POST", json: { action } })
			if (action === "update") {
				offsetRef.current = 0
				setLog("")
				setAutoscroll(true)
			}
			setLive(true)
			toast.ok(action === "update" ? L("به\u200cروزرسانی شروع شد", "Update started") : L("در حال بررسی نسخه جدید…", "Checking for updates…"))
			window.setTimeout(() => {
				void pull()
				void pullLog()
			}, 900)
		} catch (err) {
			toast.err(err instanceof Error ? err.message : L("خطا", "Error"))
		} finally {
			setPending(null)
		}
	}

	const cancel = async () => {
		setPending("cancel")
		try {
			await api("/api/system/update", { method: "POST", json: { action: "cancel" } })
			toast.ok(L("درخواست لغو شد", "Request cancelled"))
			await pull()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : L("خطا", "Error"))
		} finally {
			setPending(null)
		}
	}

	const copy = async (text: string) => {
		if (await copyText(text)) toast.ok(L("کپی شد", "Copied"))
	}
	const downloadLog = () => {
		const url = URL.createObjectURL(new Blob([log || ""], { type: "text/plain;charset=utf-8" }))
		const a = document.createElement("a")
		a.href = url
		a.download = `srpanel-update-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`
		document.body.appendChild(a)
		a.click()
		a.remove()
		URL.revokeObjectURL(url)
	}

	const job = data.job
	const latest = data.latest
	const agent = data.agent
	const state = data.pending ? "queued" : job?.state ?? "idle"
	const running = state === "running" || state === "checking" || state === "queued"
	const stepIndex = STEPS.indexOf((job?.step ?? "") as (typeof STEPS)[number])
	const behind = latest?.behind ?? 0
	const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(locale === "fa" ? "fa-IR" : "en-GB") : "—")
	const elapsed = job?.startedAt && running ? (Date.now() - Date.parse(job.startedAt)) / 1000 : job?.startedAt && job?.finishedAt ? (Date.parse(job.finishedAt) - Date.parse(job.startedAt)) / 1000 : 0
	const progress = state === "success" ? 100 : state === "queued" ? 4 : running ? Math.min(96, ((Math.max(stepIndex, 0) + 0.5) / STEPS.length) * 100) : state === "failed" ? Math.max(10, ((Math.max(stepIndex, 0) + 1) / STEPS.length) * 100) : 0
	const stepLabel = (s: (typeof STEPS)[number]) => (s === "source" ? L("دریافت سورس", "Fetch source") : s === "build" ? L("ساخت و راه\u200cاندازی", "Build and start") : L("بررسی سلامت", "Health check"))

	return (
		<div className="pb-10">
			<PageHeader
				title={L("به\u200cروزرسانی پنل", "Panel updates")}
				subtitle={L("بدون ورود به سرور، از همین\u200cجا نسخه جدید را بررسی و نصب کنید", "Check and install new versions right here - no SSH needed")}
				actions={
					<>
						{data.pending && (
							<Button variant="ghost" onClick={() => void cancel()} loading={pending === "cancel"}>
								<XCircle className="h-4 w-4" />
								{L("لغو درخواست", "Cancel request")}
							</Button>
						)}
						<Button variant="ghost" onClick={() => void send("check")} loading={pending === "check"} disabled={running}>
							<RefreshCw className={cx("h-4 w-4", state === "checking" && "animate-spin")} />
							{L("بررسی نسخه جدید", "Check for updates")}
						</Button>
						<Button variant={behind > 0 ? "primary" : "default"} onClick={() => void send("update")} loading={pending === "update"} disabled={running || !agent?.online}>
							<ArrowDownToLine className="h-4 w-4" />
							{behind > 0 ? L("نصب نسخه جدید", "Install update") : L("بازسازی آخرین نسخه", "Rebuild latest")}
						</Button>
					</>
				}
			/>

			{/* ---------- hero: installed → available ---------- */}
			<Tilt max={5}>
				<Card className="sheen overflow-hidden">
					<div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
						<div>
							<div className="text-xs text-muted">{L("نسخه نصب\u200cشده", "Installed")}</div>
							<div className="flex items-end gap-2">
								<span className="bg-gradient-to-r from-violet-soft to-cyan bg-clip-text text-4xl font-black tracking-tight text-transparent">v{data.version}</span>
								{behind === 0 && latest && <Sparkles className="mb-1.5 h-4 w-4 text-success" />}
							</div>
							<div className="mt-2 flex flex-wrap items-center gap-1.5">
								{data.branch && <Badge tone="violet">{data.branch}</Badge>}
								{data.commit && (
									<button type="button" className="badge badge-muted mono cursor-pointer" dir="ltr" title={L("کپی کامیت", "Copy commit")} onClick={() => void copy(data.commit as string)}>
										{shortSha(data.commit)}
									</button>
								)}
							</div>
						</div>

						<div className="hidden md:block">
							<div className={cx("flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br", behind > 0 ? "from-warning/30 to-warning/5 text-warning" : "from-success/30 to-success/5 text-success")}>
								{behind > 0 ? <ArrowDownToLine className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
							</div>
						</div>

						<div>
							<div className="text-xs text-muted">{L("آخرین نسخه موجود", "Latest available")}</div>
							{latest ? (
								<>
									<div className="flex flex-wrap items-end gap-2">
										<span className="text-4xl font-black tracking-tight">{latest.remoteVersion ? "v" + latest.remoteVersion : "—"}</span>
										{behind > 0 ? <Badge tone="warning">{L(behind + " کامیت عقب\u200cتر", behind + " commits behind")}</Badge> : <Badge tone="success">{L("به\u200cروز", "Up to date")}</Badge>}
									</div>
									<div className="mt-2 flex flex-wrap items-center gap-1.5">
										{latest.remoteCommit && (
											<button type="button" className="badge badge-muted mono cursor-pointer" dir="ltr" title={L("کپی کامیت", "Copy commit")} onClick={() => void copy(latest.remoteCommit)}>
												{shortSha(latest.remoteCommit)}
											</button>
										)}
										<span className="flex items-center gap-1 text-[11px] text-muted">
											<Clock className="h-3 w-3" />
											{fmt(latest.checkedAt)}
										</span>
									</div>
									{latest.subject && (
										<p className="mt-2 line-clamp-2 text-sm text-muted" dir="auto">
											{latest.subject}
										</p>
									)}
									{latest.error && <p className="mt-2 text-xs text-danger">{latest.error}</p>}
								</>
							) : (
								<p className="mt-2 text-sm text-muted">{L("هنوز بررسی نشده — دکمهٔ «بررسی نسخه جدید» را بزنید.", "Not checked yet - press Check for updates.")}</p>
							)}
						</div>
					</div>
				</Card>
			</Tilt>

			{/* ---------- live job ---------- */}
			<Card
				className="mt-4"
				title={L("وضعیت عملیات", "Job status")}
				subtitle={job?.id || undefined}
				actions={
					<div className="flex flex-wrap items-center gap-2">
						{state === "queued" ? (
							<Badge tone="warning">{L("در صف", "Queued")}</Badge>
						) : running ? (
							<Badge tone="cyan">{L("در حال اجرا", "Running")}</Badge>
						) : state === "success" ? (
							<Badge tone="success">{L("موفق", "Success")}</Badge>
						) : state === "failed" ? (
							<Badge tone="danger">{L("ناموفق", "Failed")}</Badge>
						) : (
							<Badge tone="muted">{L("بی\u200cکار", "Idle")}</Badge>
						)}
						{reconnecting && <Badge tone="warning">{L("در حال بالا آمدن سرویس…", "Service restarting…")}</Badge>}
						{elapsed > 0 && (
							<span className="num flex items-center gap-1 text-xs text-muted">
								<Clock className="h-3 w-3" />
								{clock(elapsed)}
							</span>
						)}
					</div>
				}
			>
				<div className="mb-1 flex items-center justify-between text-[11px] text-muted">
					<span>{running ? stepLabel((STEPS[Math.max(stepIndex, 0)] ?? "source") as (typeof STEPS)[number]) : state === "success" ? L("پایان موفق", "Finished") : L("آماده", "Ready")}</span>
					<span className="num">{Math.round(progress)}%</span>
				</div>
				<Progress value={progress} />

				<div className="mt-4 grid gap-2 sm:grid-cols-3">
					{STEPS.map((s, i) => {
						const active = running && stepIndex === i
						const done = state === "success" || (stepIndex > i && state !== "failed")
						const failed = state === "failed" && stepIndex === i
						return (
							<div key={s} className={cx("glass flex items-center gap-2 rounded-xl px-3 py-2 text-sm", active && "float border-cyan/50", done && "border-success/40", failed && "border-danger/50")}>
								{failed ? <XCircle className="h-4 w-4 text-danger" /> : done ? <CheckCircle2 className="h-4 w-4 text-success" /> : active ? <Zap className="h-4 w-4 animate-pulse text-cyan" /> : <span className="h-4 w-4 rounded-full border" />}
								<span>{stepLabel(s)}</span>
							</div>
						)
					})}
				</div>

				{job?.error && (
					<p className="mt-3 flex items-start gap-2 text-sm text-danger">
						<XCircle className="mt-0.5 h-4 w-4 shrink-0" />
						{job.error}
					</p>
				)}
				{state === "success" && job && (
					<p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-success">
						<CheckCircle2 className="h-4 w-4" />
						{L("نصب شد: نسخه ", "Installed: v") + (job.toVersion || data.version)}
						{job.fromVersion && job.fromVersion !== job.toVersion && <span className="text-muted" dir="ltr">{`v${job.fromVersion} → v${job.toVersion}`}</span>}
						{job.toCommit && <span className="mono text-[11px] text-muted" dir="ltr">{shortSha(job.toCommit)}</span>}
						{job.finishedAt && <span className="text-[11px] text-muted">{fmt(job.finishedAt)}</span>}
					</p>
				)}
			</Card>

			{/* ---------- agent ---------- */}
			<div className="mt-4 grid gap-4 lg:grid-cols-2">
				<Card
					title={L("سرویس به\u200cروزرسانی سرور", "Host update service")}
					actions={agent?.online ? <Badge tone="success">{L("فعال", "Online")}</Badge> : <Badge tone="danger">{L("غیرفعال", "Offline")}</Badge>}
				>
					<div className="flex items-start gap-3">
						<div className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br", agent?.online ? "from-success/30 to-success/5 text-success" : "from-danger/30 to-danger/5 text-danger")}>
							<Server className="h-5 w-5" />
						</div>
						<div className="min-w-0 flex-1 space-y-1 text-xs text-muted">
							<p className="flex items-center gap-1.5">
								<Activity className={cx("h-3.5 w-3.5", agent?.online ? "text-success pulse-dot" : "text-muted")} />
								{agent ? L("آخرین ضربان: ", "Last heartbeat: ") + agent.ageSec + L(" ثانیه پیش", "s ago") : L("روی سرور نصب نشده است", "Not installed on the host")}
							</p>
							{agent?.agentVersion && <p dir="ltr">agent v{agent.agentVersion}{agent.poll ? ` • poll ${agent.poll}s` : ""}</p>}
							{agent?.dir && <p className="mono truncate" dir="ltr">{agent.dir}</p>}
							<p className="mono truncate" dir="ltr">{data.stateDir}</p>
						</div>
					</div>
				</Card>

				<Card title={L("چه اتفاقی می\u200cافتد؟", "What happens?")}>
					<ul className="list-inside list-disc space-y-1 text-sm text-muted">
						<li>{L("سورس جدید گرفته می\u200cشود و ایمیج‌ها دوباره ساخته می‌شوند.", "The new source is fetched and the images are rebuilt.")}</li>
						<li>{L("دیتابیس، کلاینت\u200cها و فایل\u200cها دست\u200cنخورده می\u200cمانند و مایگریشن خودکار اجرا می\u200cشود.", "Your database, clients and files stay intact; migrations run automatically.")}</li>
						<li>{L("اگر ساخت نسخه جدید خطا بدهد، پنل خودکار به نسخه قبلی برمی\u200cگردد.", "If the build fails, the panel rolls back to the previous version automatically.")}</li>
						<li>{L("ممکن است پنل دو تا پنج دقیقه موقتاً قطع شود؛ این صفحه خودش دوباره وصل می\u200cشود.", "The panel may drop for two to five minutes; this page reconnects by itself.")}</li>
					</ul>
				</Card>
			</div>

			{!agent?.online && (
				<Card className="mt-4 border-warning/40" title={L("یک قدم روی سرور (فقط یک\u200cبار)", "One-time step on the server")}>
					<p className="flex items-start gap-2 text-sm text-muted">
						<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
						{L("برای فعال شدن به\u200cروزرسانی از داخل پنل، یک\u200cبار این دستور را روی سرور اجرا کنید؛ بعد از آن همه‌چیز از همین صفحه انجام می\u200cشود.", "Run this once on the server to enable in-panel updates; after that everything happens from this page.")}
					</p>
					<div className="mt-3 flex items-center gap-2">
						<code className="glass rounded-lg px-3 py-2 text-sm" dir="ltr">{AGENT_CMD}</code>
						<Button variant="ghost" size="icon" title={L("کپی", "Copy")} onClick={() => void copy(AGENT_CMD)}>
							<Copy className="h-4 w-4" />
						</Button>
					</div>
					<p className="mt-2 text-xs text-muted">{L("اگر دستور شناخته نشد، اول SR update را اجرا کنید تا فایل\u200cهای جدید دریافت شوند.", "If the command is unknown, run SR update first to fetch the new files.")}</p>
				</Card>
			)}

			{/* ---------- console ---------- */}
			<Card
				className="mt-4"
				title={
					<span className="flex items-center gap-2">
						<Terminal className="h-4 w-4 text-cyan" />
						{L("کنسول زنده", "Live console")}
					</span>
				}
				subtitle={log ? `${(log.length / 1024).toFixed(1)} KB` : undefined}
				actions={
					<>
						<button type="button" onClick={() => setAutoscroll((v) => !v)} className={cx("badge cursor-pointer", autoscroll ? "badge-cyan" : "badge-muted")}>
							{L("اسکرول خودکار", "Auto-scroll")}
						</button>
						<Button variant="ghost" size="icon" title={L("تازه\u200cسازی", "Refresh")} onClick={() => void pullLog()}>
							<ScrollText className="h-4 w-4" />
						</Button>
						<Button variant="ghost" size="icon" title={L("کپی", "Copy")} onClick={() => void copy(log)} disabled={!log}>
							<Copy className="h-4 w-4" />
						</Button>
						<Button variant="ghost" size="icon" title={L("دانلود", "Download")} onClick={downloadLog} disabled={!log}>
							<Download className="h-4 w-4" />
						</Button>
					</>
				}
			>
				<pre ref={logRef} dir="ltr" className="scrollbar-thin max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/40 p-3 font-mono text-xs leading-5">
					{log || L("هنوز لاگی نیست.", "No log yet.")}
				</pre>
			</Card>
		</div>
	)
}
