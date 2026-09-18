"use client"

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Input, Switch, useToast } from "@/components/ui"

type Rule = { everyDays: number; maxCycles: number; cycles: number; extendExpiry: boolean; nextAt: string; lastAt: string | null }

const toInt = (v: string) => Math.max(0, Math.floor(Number(v) || 0))

/**
 * «تمدید/ریست خودکار» — every N days the worker zeroes this client's traffic on
 * every panel it lives on and (optionally) moves the expiry one cycle forward.
 */
export function AutoRenewCard({ clientId }: { clientId: string }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const toast = useToast()
	const [rule, setRule] = useState<Rule | null>(null)
	const [everyDays, setEveryDays] = useState(30)
	const [maxCycles, setMaxCycles] = useState(0)
	const [extendExpiry, setExtendExpiry] = useState(true)
	const [busy, setBusy] = useState("")
	const endpoint = `/api/clients/${clientId}/auto-renew`
	const msg = (e: unknown) => (e instanceof ApiError ? e.message : t("error_generic"))

	const apply = (r: Rule | null) => {
		setRule(r)
		if (r) {
			setEveryDays(r.everyDays)
			setMaxCycles(r.maxCycles)
			setExtendExpiry(r.extendExpiry)
		}
	}

	useEffect(() => {
		const load = async () => {
			try {
				const r = await api<{ rule: Rule | null }>(endpoint)
				apply(r.rule)
			} catch {
				/* the card stays in “off” state */
			}
		}
		void load()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [clientId])

	const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale === "fa" ? "fa-IR" : "en-US") : "—")

	const save = async () => {
		setBusy("save")
		try {
			const r = await api<{ rule: Rule }>(endpoint, { method: "PUT", json: { everyDays, maxCycles, extendExpiry } })
			apply(r.rule)
			toast.ok(t("set_saved"))
		} catch (e) {
			toast.err(msg(e))
		} finally {
			setBusy("")
		}
	}

	const stop = async () => {
		setBusy("stop")
		try {
			await api(endpoint, { method: "DELETE" })
			setRule(null)
			toast.ok(t("set_saved"))
		} catch (e) {
			toast.err(msg(e))
		} finally {
			setBusy("")
		}
	}

	return (
		<Card
			title={L("تمدید خودکار", "Auto-renew")}
			subtitle={L("هر چند روز یک‌بار مصرف صفر می‌شود و در صورت انتخاب، انقضا یک دوره جلو می‌رود", "Zeroes the usage every N days and optionally pushes the expiry one cycle forward")}
			actions={
				rule ? (
					<Badge tone="success">{`${L("فعال", "On")} • ${rule.cycles}${rule.maxCycles > 0 ? `/${rule.maxCycles}` : ""}`}</Badge>
				) : (
					<Badge tone="muted">{L("خاموش", "Off")}</Badge>
				)
			}
		>
			<div className="grid gap-3 sm:grid-cols-3">
				<div>
					<label className="label">{L("هر چند روز", "Every N days")}</label>
					<Input type="number" min={1} max={365} value={everyDays} onChange={(e) => setEveryDays(Math.min(365, Math.max(1, toInt(e.target.value) || 1)))} />
				</div>
				<div>
					<label className="label">{L("تعداد دوره (۰ = بی‌نهایت)", "Cycles (0 = forever)")}</label>
					<Input type="number" min={0} max={1000} value={maxCycles} onChange={(e) => setMaxCycles(toInt(e.target.value))} />
				</div>
				<div className="flex items-end">
					<Switch checked={extendExpiry} onChange={() => setExtendExpiry(!extendExpiry)} label={L("تمدید انقضا", "Extend expiry")} />
				</div>
			</div>
			<div className="mt-3 flex gap-1.5">
				{[7, 30, 60, 90].map((d) => (
					<button key={d} type="button" className={`badge cursor-pointer ${everyDays === d ? "badge-cyan" : "badge-muted"}`} onClick={() => setEveryDays(d)}>
						{d} {t("day_short")}
					</button>
				))}
			</div>
			{rule && (
				<dl className="mt-4 space-y-1.5 text-xs">
					<div className="flex justify-between">
						<dt className="text-muted">{L("دورهٔ بعدی", "Next reset")}</dt>
						<dd>{when(rule.nextAt)}</dd>
					</div>
					<div className="flex justify-between">
						<dt className="text-muted">{L("آخرین ریست", "Last reset")}</dt>
						<dd>{when(rule.lastAt)}</dd>
					</div>
				</dl>
			)}
			<div className="mt-4 flex flex-wrap items-center gap-2">
				<Button variant="primary" loading={busy === "save"} onClick={save}>
					<RefreshCw className="h-4 w-4" />
					{rule ? L("به‌روزرسانی", "Update") : L("فعال‌سازی", "Turn on")}
				</Button>
				{rule && (
					<Button variant="danger" loading={busy === "stop"} onClick={stop}>
						{L("خاموش‌کردن", "Turn off")}
					</Button>
				)}
			</div>
		</Card>
	)
}
