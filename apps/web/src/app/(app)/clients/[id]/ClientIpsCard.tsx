"use client"

import { useEffect, useState } from "react"
import { RefreshCw, Trash2, Wifi } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Spinner, useConfirm, useToast } from "@/components/ui"

type IpServer = { serverId: string; serverName: string; email: string; ips: string[]; error?: string }
type Report = { limit: number; total: number; servers: IpServer[] }

/**
 * «آی‌پی‌های متصل» — the IP record each panel keeps for this client. That record is
 * exactly what 3x-ui counts against `limitIp`, so clearing it is the fix when a
 * customer changed device and got locked out.
 */
export function ClientIpsCard({ clientId, ipLimit }: { clientId: string; ipLimit: number }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const toast = useToast()
	const confirm = useConfirm()
	const [report, setReport] = useState<Report | null>(null)
	const [busy, setBusy] = useState("")
	const endpoint = `/api/clients/${clientId}/ips`
	const msg = (e: unknown) => (e instanceof ApiError ? e.message : t("error_generic"))
	const limit = report?.limit ?? ipLimit

	const load = async (notify = false) => {
		setBusy("load")
		try {
			setReport(await api<Report>(endpoint))
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

	const clear = async () => {
		if (!confirm(L("سوابق آی‌پی این کلاینت پاک شود؟", "Clear the IP record of this client?"))) return
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
			title={L("آی‌پی‌های متصل", "Connected IPs")}
			subtitle={L("همان سوابقی که پنل برای محدودیت آی‌پی می‌شمارد", "The record the panel counts for the IP limit")}
			actions={
				<Badge tone={overLimit ? "danger" : "muted"}>
					{`${report?.total ?? 0} / ${limit > 0 ? limit : t("unlimited")}`}
				</Badge>
			}
		>
			{busy === "load" && !report ? (
				<div className="flex justify-center py-4">
					<Spinner />
				</div>
			) : !report || report.servers.length === 0 ? (
				<p className="text-sm text-muted">{L("هنوز رکوردی ثبت نشده است", "No record yet")}</p>
			) : (
				<ul className="space-y-2">
					{report.servers.map((s) => (
						<li key={`${s.serverId}:${s.email}`} className="glass glass-2 p-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="min-w-0">
									<div className="flex items-center gap-1.5 text-sm font-medium">
										<Wifi className="h-3.5 w-3.5" />
										{s.serverName}
									</div>
									<div className="mono truncate text-[11px] text-muted">{s.email}</div>
								</div>
								{s.error ? <Badge tone="danger">{s.error}</Badge> : <Badge tone="muted">{s.ips.length}</Badge>}
							</div>
							{s.ips.length > 0 && (
								<div className="mt-2 flex flex-wrap gap-1.5">
									{s.ips.map((ip) => (
										<span key={ip} className="badge badge-cyan mono">
											{ip}
										</span>
									))}
								</div>
							)}
						</li>
					))}
				</ul>
			)}
			<div className="mt-4 flex flex-wrap items-center gap-2">
				<Button loading={busy === "load"} onClick={() => load(true)}>
					<RefreshCw className="h-4 w-4" />
					{L("به‌روزرسانی", "Refresh")}
				</Button>
				<Button variant="danger" loading={busy === "clear"} onClick={clear}>
					<Trash2 className="h-4 w-4" />
					{L("پاک‌کردن سوابق", "Clear record")}
				</Button>
				{overLimit && <span className="text-xs text-warning">{L("بیشتر از سقف مجاز آی‌پی", "Above the allowed IP limit")}</span>}
			</div>
		</Card>
	)
}
