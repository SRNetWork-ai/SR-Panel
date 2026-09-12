"use client"

import { CheckCircle2, Clock, XCircle, Zap } from "lucide-react"
import type { UpdateOverview } from "@srpanel/core"
import { useLocale } from "@/lib/i18n"
import { Badge, Card, Progress, cx } from "@/components/ui"
import { STEPS, clock, elapsedOf, fmtDate, isRunning, jobState, progressOf, shortSha, stepIndexOf, stepLabel, tr, type Step } from "./types"

export function UpdateJob({ data, reconnecting }: { data: UpdateOverview; reconnecting: boolean }) {
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)

	const job = data.job
	const state = jobState(data)
	const running = isRunning(state)
	const stepIndex = stepIndexOf(job?.step)
	const progress = progressOf(state, stepIndex)
	const elapsed = elapsedOf(job, running)

	return (
		<Card
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
						<Badge tone="muted">{L("بی‌کار", "Idle")}</Badge>
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
				<span>{running ? stepLabel((STEPS[Math.max(stepIndex, 0)] ?? "source") as Step, locale) : state === "success" ? L("پایان موفق", "Finished") : L("آماده", "Ready")}</span>
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
							{failed ? (
								<XCircle className="h-4 w-4 text-danger" />
							) : done ? (
								<CheckCircle2 className="h-4 w-4 text-success" />
							) : active ? (
								<Zap className="h-4 w-4 animate-pulse text-cyan" />
							) : (
								<span className="h-4 w-4 rounded-full border" />
							)}
							<span className="flex-1">{stepLabel(s, locale)}</span>
							<span className="num text-[11px] text-muted">{i + 1}/{STEPS.length}</span>
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
					{job.fromVersion && job.fromVersion !== job.toVersion && (
						<span className="text-muted" dir="ltr">{`v${job.fromVersion} → v${job.toVersion}`}</span>
					)}
					{job.toCommit && (
						<span className="mono text-[11px] text-muted" dir="ltr">{shortSha(job.toCommit)}</span>
					)}
					{job.finishedAt && <span className="text-[11px] text-muted">{fmtDate(job.finishedAt, locale)}</span>}
				</p>
			)}
		</Card>
	)
}
