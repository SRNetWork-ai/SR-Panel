"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { AlertTriangle, ArrowDownToLine, CheckCircle2, Clock, Copy, RefreshCw, ScrollText, Server, Sparkles, XCircle, Zap } from "lucide-react"
import type { UpdateOverview } from "@srpanel/core"
import { ApiError, api, copyText } from "@/lib/client"
import { useLocale } from "@/lib/i18n"
import { Badge, Button, Card, PageHeader, cx, useConfirm, useToast } from "@/components/ui"

type LogResp = { size: number; offset: number; chunk: string; state: string; step: string }

const STEPS = ["source", "build", "health"] as const
const AGENT_CMD = "SR agent install"

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

export function UpdatesClient({ initial }: { initial: UpdateOverview }) {
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)

	const [data, setData] = useState<UpdateOverview>(initial)
	const [log, setLog] = useState("")
	const [live, setLive] = useState<boolean>(initial.busy)
	const [pending, setPending] = useState<"check" | "update" | null>(null)
	const [reconnecting, setReconnecting] = useState(false)
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

	useEffect(() => {
		if (!live) return
		const id = window.setInterval(() => {
			void pull()
			void pullLog()
		}, 2000)
		return () => window.clearInterval(id)
	}, [live, pull, pullLog])

	useEffect(() => {
		const el = logRef.current
		if (el) el.scrollTop = el.scrollHeight
	}, [log])

	const send = async (action: "check" | "update") => {
		if (action === "update" && !confirm(L("پنل به آخرین نسخه به\u200cروزرسانی و سرویس\u200cها بازسازی می\u200cشوند و چند دقیقه موقتاً در دسترس نیست. ادامه؟", "The panel will be updated and rebuilt; it goes offline for a few minutes. Continue?"))) return
		setPending(action)
		try {
			await api("/api/system/update", { method: "POST", json: { action } })
			if (action === "update") {
				offsetRef.current = 0
				setLog("")
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

	const copy = async (text: string) => {
		if (await copyText(text)) toast.ok(L("کپی شد", "Copied"))
	}

	const job = data.job
	const latest = data.latest
	const agent = data.agent
	const state = job?.state ?? "idle"
	const running = state === "running" || state === "checking" || !!data.pending
	const stepIndex = STEPS.indexOf((job?.step ?? "") as (typeof STEPS)[number])
	const behind = latest?.behind ?? 0
	const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(locale === "fa" ? "fa-IR" : "en-GB") : "—")

	return (
		<div className="pb-10">
			<PageHeader
				title={L("به\u200cروزرسانی پنل", "Panel updates")}
				subtitle={L("بدون ورود به سرور، از همین\u200cجا نسخه جدید را بررسی و نصب کنید", "Check and install new versions right here - no SSH needed")}
				actions={
					<>
						<Button variant="ghost" onClick={() => void send("check")} loading={pending === "check"} disabled={running}>
							<RefreshCw className={cx("h-4 w-4", state === "checking" && "animate-spin")} />
							{L("بررسی نسخه جدید", "Check for updates")}
						</Button>
						<Button onClick={() => void send("update")} loading={pending === "update"} disabled={running || !agent?.online}>
							<ArrowDownToLine className="h-4 w-4" />
							{behind > 0 ? L("نصب نسخه جدید", "Install update") : L("بازسازی آخرین نسخه", "Rebuild latest")}
						</Button>
					</>
				}
			/>

			<div className="grid gap-4 lg:grid-cols-3">
				<Tilt>
					<Card className="sheen h-full" title={L("نسخه نصب\u200cشده", "Installed version")}>
						<div className="flex items-end gap-2">
							<span className="text-3xl font-black tracking-tight">v{data.version}</span>
							<Sparkles className="mb-1 h-4 w-4 text-success" />
						</div>
						<div className="mt-3 flex flex-wrap items-center gap-2">
							{data.commit && <Badge tone="muted">{data.commit}</Badge>}
							{data.branch && <Badge tone="violet">{data.branch}</Badge>}
						</div>
					</Card>
				</Tilt>

				<Tilt>
					<Card className="sheen h-full" title={L("آخرین نسخه موجود", "Latest available")}>
						{latest ? (
							<>
								<div className="flex flex-wrap items-end gap-2">
									<span className="text-3xl font-black tracking-tight">{latest.remoteVersion ? "v" + latest.remoteVersion : "—"}</span>
									{behind > 0 ? (
										<Badge tone="warning">{L(behind + " کامیت عقب\u200cتر", behind + " commits behind")}</Badge>
									) : (
										<Badge tone="success">{L("به\u200cروز", "Up to date")}</Badge>
									)}
								</div>
								{latest.subject && <p className="mt-2 line-clamp-2 text-sm text-muted" dir="auto">{latest.subject}</p>}
								<p className="mt-2 text-xs text-muted">{L("آخرین بررسی: ", "Last check: ") + fmt(latest.checkedAt)}</p>
								{latest.error && <p className="mt-2 text-xs text-danger">{latest.error}</p>}
							</>
						) : (
							<p className="text-sm text-muted">{L("هنوز بررسی نشده — دکمه «بررسی نسخه جدید» را بزنید.", "Not checked yet - press Check for updates.")}</p>
						)}
					</Card>
				</Tilt>

				<Tilt>
					<Card className="sheen h-full" title={L("سرویس به\u200cروزرسانی سرور", "Host update service")}>
						<div className="flex items-center gap-2">
							<Server className="h-5 w-5 text-muted" />
							{agent?.online ? <Badge tone="success">{L("فعال", "Online")}</Badge> : <Badge tone="danger">{L("غیرفعال", "Offline")}</Badge>}
							{agent?.agentVersion && <span className="text-xs text-muted">agent v{agent.agentVersion}</span>}
						</div>
						<p className="mt-3 text-xs text-muted">
							{agent ? L("آخرین ضربان: ", "Last heartbeat: ") + agent.ageSec + L(" ثانیه پیش", "s ago") : L("روی سرور نصب نشده است", "Not installed on the host")}
						</p>
						{agent?.dir && <p className="mt-1 text-xs text-muted" dir="ltr">{agent.dir}</p>}
					</Card>
				</Tilt>
			</div>

			{!agent?.online && (
				<Card className="mt-4 border-warning/40" title={L("یک قدم روی سرور (فقط یک\u200cبار)", "One-time step on the server")}>
					<p className="flex items-start gap-2 text-sm text-muted">
						<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
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

			<Card className="mt-4" title={L("وضعیت", "Status")} subtitle={job?.id ? job.id : undefined}>
				<div className="flex flex-wrap items-center gap-2">
					{running ? (
						<Badge tone="cyan">{L("در حال اجرا", "Running")}</Badge>
					) : state === "success" ? (
						<Badge tone="success">{L("موفق", "Success")}</Badge>
					) : state === "failed" ? (
						<Badge tone="danger">{L("ناموفق", "Failed")}</Badge>
					) : (
						<Badge tone="muted">{L("بی\u200cکار", "Idle")}</Badge>
					)}
					{reconnecting && <Badge tone="warning">{L("در حال بالا آمدن سرویس…", "Service restarting…")}</Badge>}
					{job?.startedAt && (
						<span className="flex items-center gap-1 text-xs text-muted">
							<Clock className="h-3 w-3" />
							{fmt(job.startedAt)}
						</span>
					)}
				</div>
				<div className="mt-4 grid gap-2 sm:grid-cols-3">
					{STEPS.map((s, i) => {
						const active = running && stepIndex === i
						const done = state === "success" || (stepIndex > i && state !== "failed")
						return (
							<div key={s} className={cx("glass flex items-center gap-2 rounded-xl px-3 py-2 text-sm", active && "float border-cyan/50", done && "border-success/40")}>
								{done ? <CheckCircle2 className="h-4 w-4 text-success" /> : active ? <Zap className="h-4 w-4 animate-pulse" /> : <span className="h-4 w-4 rounded-full border" />}
								<span>{s === "source" ? L("دریافت سورس", "Fetch source") : s === "build" ? L("ساخت و راه\u200cاندازی", "Build and start") : L("بررسی سلامت", "Health check")}</span>
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
					<p className="mt-3 text-sm text-success">{L("نصب شد: نسخه ", "Installed: v") + (job.toVersion || data.version) + (job.toCommit ? " (" + job.toCommit + ")" : "")}</p>
				)}
			</Card>

			<Card
				className="mt-4"
				title={L("کنسول زنده", "Live console")}
				actions={
					<Button variant="ghost" size="sm" onClick={() => void pullLog()}>
						<ScrollText className="h-4 w-4" />
						{L("تازه\u200cسازی", "Refresh")}
					</Button>
				}
			>
				<pre ref={logRef} dir="ltr" className="scrollbar-thin max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/40 p-3 font-mono text-xs leading-5">
					{log || L("هنوز لاگی نیست.", "No log yet.")}
				</pre>
			</Card>

			<Card className="mt-4" title={L("چه اتفاقی می\u200cافتد؟", "What happens?")}>
				<ul className="list-inside list-disc space-y-1 text-sm text-muted">
					<li>{L("سورس جدید گرفته می\u200cشود و ایمیج‌ها دوباره ساخته می\u200cشوند.", "The new source is fetched and the images are rebuilt.")}</li>
					<li>{L("دیتابیس، کلاینت\u200cها و فایل\u200cها دست\u200cنخورده می\u200cمانند و مایگریشن خودکار اجرا می\u200cشود.", "Your database, clients and files stay intact; migrations run automatically.")}</li>
					<li>{L("اگر ساخت نسخه جدید خطا بدهد، پنل خودکار به نسخه قبلی برمی\u200cگردد.", "If the build fails, the panel rolls back to the previous version automatically.")}</li>
					<li>{L("ممکن است پنل دو تا پنج دقیقه موقتاً قطع شود؛ این صفحه خودش دوباره وصل می\u200cشود.", "The panel may drop for two to five minutes; this page reconnects by itself.")}</li>
				</ul>
			</Card>
		</div>
	)
}
