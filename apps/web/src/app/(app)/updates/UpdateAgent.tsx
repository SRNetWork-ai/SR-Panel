"use client"

import { Activity, AlertTriangle, Copy, Server } from "lucide-react"
import type { UpdateOverview } from "@srpanel/core"
import { useLocale } from "@/lib/i18n"
import { Badge, Button, Card, cx } from "@/components/ui"
import { AGENT_CMD, tr } from "./types"

export function UpdateAgent({ data, onCopy }: { data: UpdateOverview; onCopy: (text: string) => void }) {
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const agent = data.agent

	return (
		<>
			<div className="grid gap-4 lg:grid-cols-2">
				<Card
					title={L("سرویس به‌روزرسانی سرور", "Host update service")}
					actions={agent?.online ? <Badge tone="success">{L("فعال", "Online")}</Badge> : <Badge tone="danger">{L("غیرفعال", "Offline")}</Badge>}
				>
					<div className="flex items-start gap-3">
						<div className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br", agent?.online ? "from-success/30 to-success/5 text-success" : "from-danger/30 to-danger/5 text-danger")}>
							<Server className="h-5 w-5" />
						</div>
						<div className="min-w-0 flex-1 space-y-1 text-xs text-muted">
							<p className="flex items-center gap-1.5">
								<Activity className={cx("h-3.5 w-3.5", agent?.online ? "pulse-dot text-success" : "text-muted")} />
								{agent ? L("آخرین ضربان: ", "Last heartbeat: ") + agent.ageSec + L(" ثانیه پیش", "s ago") : L("روی سرور نصب نشده است", "Not installed on the host")}
							</p>
							{agent?.agentVersion && (
								<p dir="ltr">
									agent v{agent.agentVersion}
									{agent.poll ? ` • poll ${agent.poll}s` : ""}
								</p>
							)}
							{agent?.dir && (
								<p className="mono truncate" dir="ltr" title={agent.dir}>
									{agent.dir}
								</p>
							)}
							<p className="mono truncate" dir="ltr" title={data.stateDir}>
								{data.stateDir}
							</p>
						</div>
					</div>
				</Card>

				<Card title={L("چه اتفاقی می‌افتد؟", "What happens?")}>
					<ul className="list-inside list-disc space-y-1 text-sm text-muted">
						<li>{L("سورس جدید گرفته می‌شود و ایمیج‌ها دوباره ساخته می‌شوند.", "The new source is fetched and the images are rebuilt.")}</li>
						<li>{L("دیتابیس، کلاینت‌ها و فایل‌ها دست‌نخورده می‌مانند و مایگریشن خودکار اجرا می‌شود.", "Your database, clients and files stay intact; migrations run automatically.")}</li>
						<li>{L("اگر ساخت نسخه جدید خطا بدهد، پنل خودکار به نسخه قبلی برمی‌گردد.", "If the build fails, the panel rolls back to the previous version automatically.")}</li>
						<li>{L("ممکن است پنل دو تا پنج دقیقه موقتاً قطع شود؛ این صفحه خودش دوباره وصل می‌شود.", "The panel may drop for two to five minutes; this page reconnects by itself.")}</li>
					</ul>
				</Card>
			</div>

			{!agent?.online && (
				<Card className="mt-4 border-warning/40" title={L("یک قدم روی سرور (فقط یک‌بار)", "One-time step on the server")}>
					<p className="flex items-start gap-2 text-sm text-muted">
						<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
						{L("برای فعال شدن به‌روزرسانی از داخل پنل، یک‌بار این دستور را روی سرور اجرا کنید؛ بعد از آن همه‌چیز از همین صفحه انجام می‌شود.", "Run this once on the server to enable in-panel updates; after that everything happens from this page.")}
					</p>
					<div className="mt-3 flex items-center gap-2">
						<code className="glass rounded-lg px-3 py-2 text-sm" dir="ltr">{AGENT_CMD}</code>
						<Button type="button" variant="ghost" size="icon" title={L("کپی", "Copy")} onClick={() => onCopy(AGENT_CMD)}>
							<Copy className="h-4 w-4" />
						</Button>
					</div>
					<p className="mt-2 text-xs text-muted">{L("اگر دستور شناخته نشد، اول SR update را اجرا کنید تا فایل‌های جدید دریافت شوند.", "If the command is unknown, run SR update first to fetch the new files.")}</p>
				</Card>
			)}
		</>
	)
}
