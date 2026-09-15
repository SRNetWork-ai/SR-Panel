"use client"

import { useState } from "react"
import { AlertTriangle, Check, ChevronDown, ChevronUp, Plus, RefreshCw, X } from "lucide-react"
import { api } from "@/lib/client"
import { formatNumber, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Field, Input, Select, SubHead, cx, useToast } from "@/components/ui"
import { FX_SOURCE_LABEL, FX_SOURCE_LIST, tr, type FxDto, type FxResult, type FxSource } from "../types"
import { fxBody } from "./bodies"

const ROUND_PRESETS = [0, 100, 500, 1000]

/**
 * Automatic USDT rate: a chain of public APIs, tried top to bottom.
 * The parent form persists the settings; this card only tests and refreshes.
 */
export function FxCard({ fx, onFx, onRate, usdtEnabled, effRate }: { fx: FxDto; onFx: (p: Partial<FxDto>) => void; onRate: (rate: number) => void; usdtEnabled: boolean; effRate: number }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [busy, setBusy] = useState("")
	const [probe, setProbe] = useState<FxResult | null>(null)

	const srcName = (x: string) => {
		const entry = FX_SOURCE_LABEL[x as FxSource]
		return entry ? L(entry.fa, entry.en) : x
	}
	const freeSources = FX_SOURCE_LIST.filter((x) => !fx.sources.includes(x))

	function move(i: number, dir: -1 | 1) {
		const list = [...fx.sources]
		const [item] = list.splice(i, 1)
		if (!item) return
		const next = Math.max(0, Math.min(list.length, i + dir))
		list.splice(next, 0, item)
		onFx({ sources: list })
	}

	async function testRate() {
		setBusy("test")
		try {
			const r = await api<FxResult>("/api/store/rate", { method: "POST", json: { test: true, settings: fxBody(fx) } })
			setProbe(r)
			if (r.rate > 0) toast.ok(L("نرخ دریافت شد", "Rate fetched"))
			else toast.err(r.error || L("هیچ منبعی پاسخ نداد", "No source responded"))
		} catch (e) {
			toast.err(e instanceof Error ? e.message : t("error_generic"))
		} finally {
			setBusy("")
		}
	}

	async function refreshRate() {
		setBusy("refresh")
		try {
			const r = await api<FxResult>("/api/store/rate", { method: "POST", json: {} })
			setProbe(r)
			if (r.rate > 0) {
				onFx({ cacheRate: r.rate, cacheSource: r.source, cacheAt: r.at, fresh: true, lastError: r.error ?? "" })
				onRate(r.rate)
				toast.ok(formatNumber(r.rate) + " " + t("currency_irt"))
			} else {
				toast.err(r.error || L("دریافت نرخ ناموفق بود", "Rate fetch failed"))
			}
		} catch (e) {
			toast.err(e instanceof Error ? e.message : t("error_generic"))
		} finally {
			setBusy("")
		}
	}

	return (
		<Card
			title={L("نرخ خودکار تتر", "Automatic USDT rate")}
			subtitle={L("زنجیره منابع؛ اگر منبع اول پاسخ ندهد، خودکار سراغ بعدی می‌رود", "Source chain — if one API fails, the next is tried automatically")}
			actions={<Badge tone={fx.mode === "AUTO" ? (fx.fresh ? "success" : "warning") : "muted"}>{fx.mode === "AUTO" ? (fx.fresh ? L("به‌روز", "Fresh") : L("نیاز به رفرش", "Stale")) : L("دستی", "Manual")}</Badge>}
		>
			<div className="space-y-4">
				<div className="flex flex-wrap gap-2">
					{(["MANUAL", "AUTO"] as const).map((m) => (
						<button key={m} type="button" className={cx("chip", fx.mode === m && "chip-on")} onClick={() => onFx({ mode: m })}>
							{m === "AUTO" ? L("خودکار از API", "Auto from API") : L("نرخ دستی", "Manual rate")}
						</button>
					))}
				</div>
				<div className="grid gap-3 sm:grid-cols-3">
					<div className="tile">
						<div className="text-[11px] text-muted">{L("نرخ فعلی", "Current rate")}</div>
						<div className="num text-sm font-semibold">{effRate > 0 ? formatNumber(effRate) + " " + t("currency_irt") : "—"}</div>
					</div>
					<div className="tile">
						<div className="text-[11px] text-muted">{L("منبع", "Source")}</div>
						<div className="truncate text-sm font-semibold">{fx.cacheSource ? srcName(fx.cacheSource) : "—"}</div>
					</div>
					<div className="tile">
						<div className="text-[11px] text-muted">{L("آخرین به‌روزرسانی", "Updated")}</div>
						<div className="text-sm font-semibold">{fx.cacheAt ? relativeTime(fx.cacheAt) : "—"}</div>
					</div>
				</div>

				{fx.mode === "AUTO" ? (
					<>
						<div className="space-y-2">
							<SubHead title={L("ترتیب منابع", "Source priority")} hint={L("از بالا به پایین امتحان می‌شود", "Tried top to bottom")} />
							{fx.sources.length === 0 ? <div className="text-xs text-muted">{L("هیچ منبعی انتخاب نشده است", "No source selected")}</div> : null}
							{fx.sources.map((src, i) => (
								<div key={src} className="tile flex items-center justify-between gap-2 py-2">
									<div className="flex min-w-0 items-center gap-2">
										<span className="num text-[11px] text-muted">{i + 1}</span>
										<span className="truncate text-sm">{srcName(src)}</span>
									</div>
									<div className="flex items-center gap-1">
										<Button type="button" size="sm" variant="ghost" title={L("بالا", "Up")} onClick={() => move(i, -1)}>
											<ChevronUp className="h-4 w-4" />
										</Button>
										<Button type="button" size="sm" variant="ghost" title={L("پایین", "Down")} onClick={() => move(i, 1)}>
											<ChevronDown className="h-4 w-4" />
										</Button>
										<Button type="button" size="sm" variant="ghost" title={L("حذف", "Remove")} onClick={() => onFx({ sources: fx.sources.filter((x) => x !== src) })}>
											<X className="h-4 w-4" />
										</Button>
									</div>
								</div>
							))}
							{freeSources.length ? (
								<div className="flex flex-wrap gap-1.5 pt-1">
									{freeSources.map((src) => (
										<button key={src} type="button" className="chip" onClick={() => onFx({ sources: [...fx.sources, src] })}>
											<Plus className="h-3.5 w-3.5" /> {srcName(src)}
										</button>
									))}
								</div>
							) : null}
						</div>

						<div className="grid gap-3 sm:grid-cols-2">
							<Field label={L("سود روی نرخ (٪)", "Margin (%)")} hint={L("مثبت = گران‌تر از بازار", "Positive = above market")}>
								<Input type="number" min={-20} max={50} step="0.5" value={fx.marginPct} onChange={(e) => onFx({ marginPct: Number(e.target.value) })} />
							</Field>
							<Field label={L("رُند کردن", "Rounding")}>
								<Select value={String(fx.roundTo)} onChange={(e) => onFx({ roundTo: Number(e.target.value) })}>
									{ROUND_PRESETS.map((r) => (
										<option key={r} value={r}>
											{r === 0 ? L("بدون رُند", "None") : formatNumber(r) + " " + t("currency_irt")}
										</option>
									))}
								</Select>
							</Field>
							<Field label={L("اعتبار نرخ (دقیقه)", "Cache TTL (min)")} hint={L("فاصله به‌روزرسانی خودکار", "Auto refresh interval")}>
								<Input type="number" min={1} max={1440} value={fx.ttlMin} onChange={(e) => onFx({ ttlMin: Number(e.target.value) })} />
							</Field>
							<div className="grid grid-cols-2 gap-3">
								<Field label={L("حداقل مجاز", "Min")}>
									<Input type="number" min={0} value={fx.minRate} onChange={(e) => onFx({ minRate: Number(e.target.value) })} />
								</Field>
								<Field label={L("حداکثر مجاز", "Max")}>
									<Input type="number" min={0} value={fx.maxRate} onChange={(e) => onFx({ maxRate: Number(e.target.value) })} />
								</Field>
							</div>
						</div>

						{fx.sources.includes("CUSTOM") ? (
							<div className="grid gap-3 sm:grid-cols-3">
								<div className="sm:col-span-2">
									<Field label={L("آدرس API سفارشی", "Custom API URL")} hint={L("پاسخ باید JSON باشد", "Response must be JSON")}>
										<Input dir="ltr" className="mono" value={fx.customUrl} onChange={(e) => onFx({ customUrl: e.target.value.trim() })} placeholder="https://api.example.com/usdt" />
									</Field>
								</div>
								<Field label={L("واحد پاسخ", "Unit")}>
									<Select value={fx.customUnit} onChange={(e) => onFx({ customUnit: e.target.value === "IRR" ? "IRR" : "IRT" })}>
										<option value="IRT">{L("تومان", "Toman")}</option>
										<option value="IRR">{L("ریال", "Rial")}</option>
									</Select>
								</Field>
								<div className="sm:col-span-3">
									<Field label={L("مسیر مقدار در JSON", "Value path in JSON")} hint="data.price · result.0.value">
										<Input dir="ltr" className="mono" value={fx.customPath} onChange={(e) => onFx({ customPath: e.target.value.trim() })} placeholder="data.price" />
									</Field>
								</div>
							</div>
						) : null}

						<div className="flex flex-wrap items-center gap-2">
							<Button type="button" variant="ghost" loading={busy === "test"} onClick={testRate}>
								<Check className="h-4 w-4" /> {L("تست منابع", "Test chain")}
							</Button>
							<Button type="button" loading={busy === "refresh"} onClick={refreshRate}>
								<RefreshCw className="h-4 w-4" /> {L("دریافت و ذخیره نرخ", "Fetch & save")}
							</Button>
							{fx.lastError ? (
								<span className="inline-flex items-center gap-1.5 text-[11px] text-danger">
									<AlertTriangle className="h-3.5 w-3.5" /> {fx.lastError}
								</span>
							) : null}
						</div>

						{probe ? (
							<div className="tile space-y-1.5">
								<div className="flex items-center justify-between gap-2 text-xs">
									<span className="text-muted">{L("نتیجه آخرین آزمایش", "Last probe")}</span>
									<span className="num font-semibold">{probe.rate > 0 ? formatNumber(probe.rate) + " " + t("currency_irt") : "—"}</span>
								</div>
								{probe.attempts.map((a, i) => (
									<div key={a.source + String(i)} className="flex items-center justify-between gap-2 text-[11px]">
										<span className="inline-flex items-center gap-1.5">
											{a.ok ? <Check className="h-3.5 w-3.5 text-success" /> : <X className="h-3.5 w-3.5 text-muted" />}
											{srcName(a.source)}
										</span>
										<span className={cx("truncate", a.ok ? "num text-success" : "text-muted")}>{a.ok ? formatNumber(a.rate ?? 0) : a.error || "—"}</span>
									</div>
								))}
							</div>
						) : null}

						{usdtEnabled && effRate <= 0 ? (
							<div className="tile flex items-start gap-2 text-[11px] text-warning">
								<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
								{L("تا وقتی نرخ دریافت نشود، ذخیرهٔ پرداخت تتری رد می‌شود؛ یک‌بار «دریافت و ذخیره نرخ» را بزنید.", "Saving USDT will fail until a rate exists — press “Fetch & save” once.")}
							</div>
						) : null}
					</>
				) : (
					<div className="text-xs text-muted">{L("در حالت دستی، همان نرخ واردشده در کارت تتر استفاده می‌شود.", "Manual mode uses the rate typed in the USDT card.")}</div>
				)}
			</div>
		</Card>
	)
}
