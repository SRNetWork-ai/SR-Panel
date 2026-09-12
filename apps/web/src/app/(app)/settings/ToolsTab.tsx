"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { Download, RefreshCw, RotateCcw, Stethoscope, Trash2 } from "lucide-react"
import { copyText } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, useToast } from "@/components/ui"
import { Section } from "@/components/parts"
import { collectDiagnostics, diagText, downloadText, resetPrefs, tr, type Diag, type SystemInfo } from "./types"

export function ToolsTab({ info }: { info: SystemInfo }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const router = useRouter()
	const [rows, setRows] = useState<Diag[]>([])
	const [stamp, setStamp] = useState("")

	const scan = useCallback(() => {
		setRows(collectDiagnostics(locale, info))
		setStamp(new Date().toLocaleTimeString(locale === "fa" ? "fa-IR" : "en-US"))
	}, [info, locale])

	useEffect(() => {
		scan()
	}, [scan])

	const warn = rows.filter((r) => r.tone === "warning").length
	const bad = rows.filter((r) => r.tone === "danger").length

	return (
		<div className="grid gap-4 xl:grid-cols-2">
			<Section
				icon={Stethoscope}
				title={L("عیب‌یابی مرورگر و پنل", "Browser and panel diagnostics")}
				subtitle={L("همه‌ی بررسی‌ها روی همین مرورگر انجام می‌شود", "Every check runs locally in this browser")}
				actions={
					<div className="flex items-center gap-2">
						<Badge tone={bad > 0 ? "danger" : warn > 0 ? "warning" : "success"}>{bad > 0 ? L("نیاز به بررسی", "Attention") : warn > 0 ? `${warn} ⚠` : L("همه خوب", "All good")}</Badge>
						<Button type="button" size="sm" variant="ghost" onClick={scan}>
							<RefreshCw className="h-4 w-4" />
							{t("refresh")}
						</Button>
					</div>
				}
			>
				<div className="space-y-1">
					{rows.map((r) => (
						<div key={r.id} className="flex items-center justify-between gap-3 border-b border-line/60 py-2 last:border-0">
							<span className="min-w-0 truncate text-xs text-muted">{r.label}</span>
							<Badge tone={r.tone}>{r.value}</Badge>
						</div>
					))}
				</div>
				<div className="mt-3 flex flex-wrap items-center justify-between gap-2">
					<span className="text-[11px] text-muted">{stamp ? L(`آخرین بررسی: ${stamp}`, `Last scan: ${stamp}`) : "—"}</span>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							size="sm"
							onClick={async () => {
								await copyText(diagText(rows))
								toast.ok(t("copied"))
							}}
						>
							{L("کپی گزارش", "Copy report")}
						</Button>
						<Button type="button" size="sm" onClick={() => downloadText("srpanel-diagnostics.txt", diagText(rows))}>
							<Download className="h-4 w-4" />
							{L("دانلود", "Download")}
						</Button>
					</div>
				</div>
			</Section>

			<Section icon={RotateCcw} title={L("ابزارهای نگهداری", "Maintenance tools")} subtitle={L("رفع مشکلات رایج بدون ورود به سرور", "Fix common issues without touching the server")}>
				<div className="space-y-3">
					<div className="glass-2 flex flex-wrap items-center justify-between gap-3 p-3">
						<div className="min-w-0">
							<div className="text-sm">{L("تازه‌سازی داده‌های صفحه", "Refresh page data")}</div>
							<div className="text-[11px] text-muted">{L("اگر عددی قدیمی مانده، اول این را امتحان کنید", "Try this first when a number looks stale")}</div>
						</div>
						<Button type="button" size="sm" onClick={() => router.refresh()}>
							<RefreshCw className="h-4 w-4" />
							{t("refresh")}
						</Button>
					</div>
					<div className="glass-2 flex flex-wrap items-center justify-between gap-3 p-3">
						<div className="min-w-0">
							<div className="text-sm">{L("بازنشانی تنطیمات ظاهر", "Reset appearance preferences")}</div>
							<div className="text-[11px] text-muted">{L("تم، تراکم و انیمیشن به حالت پیش‌فرض برمی‌گردد", "Theme, density and motion go back to defaults")}</div>
						</div>
						<Button
							type="button"
							size="sm"
							variant="danger"
							onClick={() => {
								resetPrefs()
								toast.ok(t("set_saved"))
								router.refresh()
							}}
						>
							<Trash2 className="h-4 w-4" />
							{L("بازنشانی", "Reset")}
						</Button>
					</div>
					<ul className="space-y-2 text-[11px] text-muted">
						<li>{L("اگر «HTTPS» قرمز است، پنل را پشت دامین و گواهی SSL بیاورید؛ ورود با IP برای کوکی و کلیپ‌بورد محدودیت دارد.", "If HTTPS shows red, put the panel behind a domain with SSL; plain-IP access limits cookies and clipboard.")}</li>
						<li>{L("اختلاف منطقه زمانی مرورگر و سرور باعث می‌شود تاریخ انقضا متفاوت دیده شود؛ مقدار TZ را روی سرور تنطیم کنید.", "A browser/server timezone mismatch makes expiry dates look different; set TZ on the server.")}</li>
						<li>{L("برای گزارش مشکل، فایل عیب‌یابی را همراه شرح ماجرا بفرستید.", "When reporting an issue, attach the diagnostics file with your description.")}</li>
					</ul>
				</div>
			</Section>
		</div>
	)
}
