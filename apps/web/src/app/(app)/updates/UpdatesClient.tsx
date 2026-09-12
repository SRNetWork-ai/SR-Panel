"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowDownToLine, RefreshCw, XCircle } from "lucide-react"
import type { UpdateOverview } from "@srpanel/core"
import { ApiError, api, copyText } from "@/lib/client"
import { useLocale } from "@/lib/i18n"
import { Button, PageHeader, cx, useConfirm, useToast } from "@/components/ui"
import { UpdateAgent } from "./UpdateAgent"
import { UpdateConsole } from "./UpdateConsole"
import { UpdateHero } from "./UpdateHero"
import { UpdateJob } from "./UpdateJob"
import { BUSY_POLL_MS, IDLE_POLL_MS, isRunning, jobState, tr, type LogResp } from "./types"

export function UpdatesClient({ initial }: { initial: UpdateOverview }) {
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const L = (fa: string, en: string) => tr(locale, fa, en)

	const [data, setData] = useState<UpdateOverview>(initial)
	const [log, setLog] = useState("")
	const [live, setLive] = useState<boolean>(initial.busy)
	const [pending, setPending] = useState<"check" | "update" | "cancel" | null>(null)
	const [reconnecting, setReconnecting] = useState(false)
	const [, setTick] = useState(0)
	const offsetRef = useRef(0)

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
		const id = window.setInterval(
			() => {
				void pull()
				if (live) void pullLog()
			},
			live ? BUSY_POLL_MS : IDLE_POLL_MS,
		)
		return () => window.clearInterval(id)
	}, [live, pull, pullLog])

	// 1s heartbeat so the elapsed timer moves
	useEffect(() => {
		if (!live) return
		const id = window.setInterval(() => setTick((t) => t + 1), 1000)
		return () => window.clearInterval(id)
	}, [live])

	const send = async (action: "check" | "update") => {
		if (action === "update" && !confirm(L("پنل به آخرین نسخه به‌روزرسانی و سرویس‌ها بازسازی می‌شوند و چند دقیقه موقتاً در دسترس نیست. ادامه؟", "The panel will be updated and rebuilt; it goes offline for a few minutes. Continue?"))) return
		setPending(action)
		try {
			await api("/api/system/update", { method: "POST", json: { action } })
			if (action === "update") {
				offsetRef.current = 0
				setLog("")
			}
			setLive(true)
			toast.ok(action === "update" ? L("به‌روزرسانی شروع شد", "Update started") : L("در حال بررسی نسخه جدید…", "Checking for updates…"))
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

	const state = jobState(data)
	const running = isRunning(state)
	const behind = data.latest?.behind ?? 0

	return (
		<div className="pb-10">
			<PageHeader
				title={L("به‌روزرسانی پنل", "Panel updates")}
				subtitle={L("بدون ورود به سرور، از همین‌جا نسخه جدید را بررسی و نصب کنید", "Check and install new versions right here - no SSH needed")}
				actions={
					<>
						{data.pending && (
							<Button type="button" variant="ghost" onClick={() => void cancel()} loading={pending === "cancel"}>
								<XCircle className="h-4 w-4" />
								{L("لغو درخواست", "Cancel request")}
							</Button>
						)}
						<Button type="button" variant="ghost" onClick={() => void send("check")} loading={pending === "check"} disabled={running}>
							<RefreshCw className={cx("h-4 w-4", state === "checking" && "animate-spin")} />
							{L("بررسی نسخه جدید", "Check for updates")}
						</Button>
						<Button type="button" variant={behind > 0 ? "primary" : "default"} onClick={() => void send("update")} loading={pending === "update"} disabled={running || !data.agent?.online}>
							<ArrowDownToLine className="h-4 w-4" />
							{behind > 0 ? L("نصب نسخه جدید", "Install update") : L("بازسازی آخرین نسخه", "Rebuild latest")}
						</Button>
					</>
				}
			/>

			<UpdateHero data={data} onCopy={(text) => void copy(text)} />

			<div className="mt-4">
				<UpdateJob data={data} reconnecting={reconnecting} />
			</div>

			<div className="mt-4">
				<UpdateAgent data={data} onCopy={(text) => void copy(text)} />
			</div>

			<UpdateConsole log={log} onRefresh={() => void pullLog()} onCopy={(text) => void copy(text)} />
		</div>
	)
}
