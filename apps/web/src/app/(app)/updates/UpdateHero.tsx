"use client"

import { ArrowDownToLine, CheckCircle2, Clock, Rocket, Server, Sparkles } from "lucide-react"
import type { UpdateOverview } from "@srpanel/core"
import { relativeTime } from "@/lib/format"
import { useLocale } from "@/lib/i18n"
import { Badge, Card, cx } from "@/components/ui"
import { MiniStat } from "@/components/bits"
import { Tilt } from "./Tilt"
import { fmtDate, shortSha, tr } from "./types"

export function UpdateHero({ data, onCopy }: { data: UpdateOverview; onCopy: (text: string) => void }) {
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const latest = data.latest
	const agent = data.agent
	const behind = latest?.behind ?? 0

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MiniStat icon={<Rocket className="h-4 w-4" />} label={L("نسخهٔ نصب‌شده", "Installed")} value={<span dir="ltr">v{data.version}</span>} tone="violet" />
				<MiniStat
					icon={behind > 0 ? <ArrowDownToLine className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
					label={L("وضعیت", "Status")}
					value={behind > 0 ? L(`${behind} کامیت عقب‌تر`, `${behind} behind`) : latest ? L("به‌روز", "Up to date") : L("بررسی نشده", "Not checked")}
					tone={behind > 0 ? "warning" : latest ? "success" : undefined}
				/>
				<MiniStat icon={<Clock className="h-4 w-4" />} label={L("آخرین بررسی", "Last check")} value={latest?.checkedAt ? relativeTime(latest.checkedAt, locale) : "—"} tone="cyan" />
				<MiniStat icon={<Server className="h-4 w-4" />} label={L("سرویس سرور", "Host agent")} value={agent?.online ? L("فعال", "Online") : L("غیرفعال", "Offline")} tone={agent?.online ? "success" : "danger"} />
			</div>

			<Tilt max={5}>
				<Card className="sheen overflow-hidden">
					<div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
						<div>
							<div className="text-xs text-muted">{L("نسخه نصب‌شده", "Installed")}</div>
							<div className="flex items-end gap-2">
								<span className="bg-gradient-to-r from-violet-soft to-cyan bg-clip-text text-4xl font-black tracking-tight text-transparent">v{data.version}</span>
								{behind === 0 && latest && <Sparkles className="mb-1.5 h-4 w-4 text-success" />}
							</div>
							<div className="mt-2 flex flex-wrap items-center gap-1.5">
								{data.branch && <Badge tone="violet">{data.branch}</Badge>}
								{data.commit && (
									<button type="button" className="badge badge-muted mono cursor-pointer" dir="ltr" title={L("کپی کامیت", "Copy commit")} onClick={() => onCopy(data.commit as string)}>
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
										{behind > 0 ? <Badge tone="warning">{L(behind + " کامیت عقب‌تر", behind + " commits behind")}</Badge> : <Badge tone="success">{L("به‌روز", "Up to date")}</Badge>}
									</div>
									<div className="mt-2 flex flex-wrap items-center gap-1.5">
										{latest.remoteCommit && (
											<button type="button" className="badge badge-muted mono cursor-pointer" dir="ltr" title={L("کپی کامیت", "Copy commit")} onClick={() => onCopy(latest.remoteCommit as string)}>
												{shortSha(latest.remoteCommit)}
											</button>
										)}
										<span className="flex items-center gap-1 text-[11px] text-muted" title={fmtDate(latest.checkedAt, locale)}>
											<Clock className="h-3 w-3" />
											{fmtDate(latest.checkedAt, locale)}
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
		</div>
	)
}
