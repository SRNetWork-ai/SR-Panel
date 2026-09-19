"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Download, FileUp, Upload } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, useToast } from "@/components/ui"

type ImportResult = {
	rows: number
	created: number
	failed: number
	dryRun: boolean
	errors: Array<{ row: number; name: string; message: string }>
}

/** «خروجی / ورودی CSV» - bulk move of clients in and out of the panel. */
export function ClientsImportExportCard() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const toast = useToast()
	const router = useRouter()
	const [csv, setCsv] = useState("")
	const [fileName, setFileName] = useState("")
	const [result, setResult] = useState<ImportResult | null>(null)
	const [busy, setBusy] = useState("")

	const pick = async (file: File | undefined) => {
		setResult(null)
		if (!file) {
			setCsv("")
			setFileName("")
			return
		}
		setFileName(file.name)
		setCsv(await file.text())
	}

	const run = async (dryRun: boolean) => {
		if (!csv.trim()) {
			toast.err(L("اول یک فایل CSV انتخاب کنید", "Pick a CSV file first"))
			return
		}
		setBusy(dryRun ? "check" : "import")
		try {
			const r = await api<ImportResult>("/api/clients/import", { method: "POST", json: { csv, dryRun } })
			setResult(r)
			if (dryRun) toast.ok(L(`${r.created} ردیف سالم، ${r.failed} ردیف مشکل‌دار`, `${r.created} ok, ${r.failed} with errors`))
			else {
				r.failed ? toast.err(L(`${r.created} ساخته شد، ${r.failed} ناموفق`, `${r.created} created, ${r.failed} failed`)) : toast.ok(t("set_saved"))
				router.refresh()
			}
		} catch (e) {
			toast.err(e instanceof ApiError ? e.message : t("error_generic"))
		} finally {
			setBusy("")
		}
	}

	return (
		<Card
			title={L("خروجی و ورودی CSV", "CSV export & import")}
			subtitle={L("گرفتن نسخهٔ پشتیبان لیست مشتری‌ها یا ساخت دسته‌جمعی از روی فایل", "Back up the client list or create clients in bulk from a file")}
		>
			<div className="flex flex-wrap items-center gap-2">
				<a className="btn" href="/api/clients/export" download>
					<Download className="h-4 w-4" />
					{L("دریافت CSV", "Download CSV")}
				</a>
				<label className="btn cursor-pointer">
					<FileUp className="h-4 w-4" />
					{fileName || L("انتخاب فایل", "Pick a file")}
					<input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
				</label>
				<Button loading={busy === "check"} disabled={!csv} onClick={() => run(true)}>
					{L("بررسی فایل", "Validate")}
				</Button>
				<Button variant="primary" loading={busy === "import"} disabled={!csv} onClick={() => run(false)}>
					<Upload className="h-4 w-4" />
					{L("وارد کردن", "Import")}
				</Button>
			</div>

			<p className="mt-3 text-xs text-muted">
				{L(
					"ستون‌های ورودی: name (اجباری)، tag، trafficGB، days یا expiresAt، ipLimit، telegramId، phone، note و targets به شکل «نام سرور:شمارهٔ اینباند» که با | جدا می‌شوند. همان فایل خروجی قابل استفاده است؛ هر بار حداکثر ۲۰۰ ردیف.",
					"Columns: name (required), tag, trafficGB, days or expiresAt, ipLimit, telegramId, phone, note and targets as «server name:inbound id» joined by |. The exported file works as-is; 200 rows per run.",
				)}
			</p>

			{result && (
				<div className="mt-3 space-y-2">
					<div className="flex flex-wrap items-center gap-2 text-xs">
						<Badge tone="muted">{`${L("ردیف", "rows")}: ${result.rows}`}</Badge>
						<Badge tone="success">{`${result.dryRun ? L("سالم", "ok") : L("ساخته شد", "created")}: ${result.created}`}</Badge>
						{result.failed > 0 && <Badge tone="danger">{`${L("خطا", "failed")}: ${result.failed}`}</Badge>}
						{result.dryRun && <span className="text-muted">{L("فقط بررسی شد، چیزی ذخیره نشد", "Validated only, nothing was written")}</span>}
					</div>
					{result.errors.length > 0 && (
						<ul className="space-y-1 text-xs">
							{result.errors.map((e) => (
								<li key={`${e.row}-${e.name}`} className="glass glass-2 p-2">
									<span className="num">#{e.row}</span> <span className="font-medium">{e.name || "—"}</span>
									<span className="text-warning"> — {e.message}</span>
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</Card>
	)
}
