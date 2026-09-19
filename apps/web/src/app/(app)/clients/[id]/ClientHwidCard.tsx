"use client"

import { useEffect, useState } from "react"
import { RefreshCw, Save, Smartphone, Trash2 } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Input, Spinner, useConfirm, useToast } from "@/components/ui"

type DeviceServer = { serverId: string; serverName: string; email: string; devices: string[]; error?: string }
type Report = { limit: number; total: number; servers: DeviceServer[] }

const toInt = (v: string) => Math.max(0, Math.min(100, Math.floor(Number(v) || 0)))

/**
 * «مدیریت دستگاه» — the per-client device limit (3x-ui `limitHwid`) plus the devices
 * the panel currently has bound. Saving the limit re-pushes the client, so the panel
 * starts enforcing it immediately; clearing releases the bound devices.
 */
export function ClientHwidCard({ clientId }: { clientId: string }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const toast = useToast()
	const confirm = useConfirm()
	const [report, setReport] = useState<Report | null>(null)
	const [limit, setLimit] = useState(0)
	const [busy, setBusy] = useState("")
	const endpoint = `/api/clients/${clientId}/hwid`
	const msg = (e: unknown) => (e instanceof ApiError ? e.message : t("error_generic"))

	const load = async (notify = false) => {
		setBusy("load")
		try {
			const r = await api<Report>(endpoint)
			setReport(r)
			setLimit(r.limit)
		} catch (e) {
			if (notify) toast.err(msg(e))
		} finally {
			setBusy("")
		}
	}

	useEffect(() => {
		void load()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [clientId])

	const save = async () => {
		setBusy("save")
		try {
			const r = await api<{ limit: number; errors: string[] }>(endpoint, { method: "PUT", json: { limit } })
			r.errors.length ? toast.err(r.errors.join(" | ")) : toast.ok(t("set_saved"))
			setLimit(r.limit)
			await load()
		} catch (e) {
			toast.err(msg(e))
		} finally {
			setBusy("")
		}
	}

	const clear = async () => {
		if (!confirm(L("دستگاه‌های ثبت‌شدهٔ این کلاینت آزاد شود؟", "Release the devices bound to this client?"))) return
		setBusy("clear")
		try {
			const r = await api<{ cleared: number; errors: string[] }>(endpoint, { method: "DELETE" })
			r.errors.length ? toast.err(r.errors.join(" | ")) : toast.ok(t("set_saved"))
			await load()
		} catch (e) {
			toast.err(msg(e))
		} finally {
			setBusy("")
		}
	}

	const overLimit = limit > 0 && (report?.total ?? 0) > limit

	return (
		<Card
			title={L("مدیریت دستگاه", "Devices")}
			subtitle={L("سقف تعداد دستگاه (HWID) و دستگاه‌های ثبت‌شده روی پنل", "Device (HWID) limit and the devices bound on the panel")}
			actions={<Badge tone={overLimit ? "danger" : "muted"}>{`${report?.total ?? 0} / ${limit > 0 ? limit : t("unlimited")}`}</Badge>}
		>
			<div className="grid gap-3 sm:grid-cols-2">
				<div>
					<label className="label">{L("سقف دستگاه (۰ = نامحدود)", "Device limit (0 = unlimited)")}</label>
					<Input type="number" min={0} max={100} value={limit} onChange={(e) => setLimit(toInt(e.target.value))} />
				</div>
				<div className="flex items-end gap-1.5">
					{[0, 1, 2, 3].map((n) => (
						<button key={n} type="button" className={`badge cursor-pointer ${limit === n ? "badge-cyan" : "badge-muted"}`} onClick={() => setLimit(n)}>
							{n === 0 ? t("unlimited") : n}
						</button>
					))}
				</div>
			</div>

			<div className="mt-4">
				{busy === "load" && !report ? (
					<div className="flex justify-center py-3">
						<Spinner />
					</div>
				) : !report || report.servers.every((s) => s.devices.length === 0 && !s.error) ? (
					<p className="text-sm text-muted">{L("دستگاهی روی پنل ثبت نشده است", "No device bound on the panel")}</p>
				) : (
					<ul className="space-y-2">
						{report.servers.map((s) => (
							<li key={`${s.serverId}:${s.email}`} className="glass glass-2 p-3">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div className="flex items-center gap-1.5 text-sm font-medium">
										<Smartphone className="h-3.5 w-3.5" />
										{s.serverName}
									</div>
									{s.error ? <Badge tone="danger">{s.error}</Badge> : <Badge tone="muted">{s.devices.length}</Badge>}
								</div>
								{s.devices.length > 0 && (
									<div className="mt-2 flex flex-wrap gap-1.5">
										{s.devices.map((d) => (
											<span key={d} className="badge badge-muted mono">
												{d}
											</span>
										))}
									</div>
								)}
							</li>
						))}
					</ul>
				)}
			</div>

			<div className="mt-4 flex flex-wrap items-center gap-2">
				<Button variant="primary" loading={busy === "save"} onClick={save}>
					<Save className="h-4 w-4" />
					{t("save")}
				</Button>
				<Button loading={busy === "load"} onClick={() => load(true)}>
					<RefreshCw className="h-4 w-4" />
					{L("به‌روزرسانی", "Refresh")}
				</Button>
				<Button variant="danger" loading={busy === "clear"} onClick={clear}>
					<Trash2 className="h-4 w-4" />
					{L("آزادکردن دستگاه‌ها", "Release devices")}
				</Button>
			</div>
		</Card>
	)
}
