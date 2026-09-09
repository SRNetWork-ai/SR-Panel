"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft, Copy, ExternalLink, QrCode, RotateCcw, Trash2 } from "lucide-react"
import { ApiError, api, copyText } from "@/lib/client"
import type { ClientDto } from "@/lib/dto"
import { daysLeft, formatBytes, formatDate, percent, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { UsageAreaChart, type UsagePoint } from "@/components/Charts"
import { QR } from "@/components/QR"
import { Badge, Button, Card, Input, Modal, Progress, Stat, StatusBadge, useConfirm, useToast } from "@/components/ui"

type Link_ = { server: string; remark: string; uri: string }

export function ClientDetail({ initial, usage, links }: { initial: ClientDto; usage: UsagePoint[]; links: Link_[] }) {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const router = useRouter()
	const [c, setC] = useState(initial)
	const [qr, setQr] = useState<string | null>(null)
	const [extend, setExtend] = useState(false)
	const [days, setDays] = useState(30)
	const [busy, setBusy] = useState(false)

	const used = c.usedUp + c.usedDown
	const pct = c.trafficLimit > 0 ? percent(used, c.trafficLimit) : 0
	const dl = daysLeft(c.expiresAt)

	const copy = async (s: string) => ((await copyText(s)) ? toast.ok(t("copied")) : toast.err(t("error_generic")))
	const patch = async (json: Record<string, unknown>) => {
		setBusy(true)
		try {
			const r = await api<{ client: ClientDto; errors: string[] }>(`/api/clients/${c.id}`, { method: "PATCH", json })
			setC(r.client)
			r.errors.length ? toast.err(r.errors.join(" | ")) : toast.ok(t("set_saved"))
			router.refresh()
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setBusy(false)
		}
	}
	const reset = async () => {
		if (!confirm(`${t("cl_reset")}?`)) return
		try {
			const r = await api<{ client: ClientDto; errors: string[] }>(`/api/clients/${c.id}/reset`, { method: "POST" })
			setC(r.client)
			r.errors.length ? toast.err(r.errors.join(" | ")) : toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		}
	}
	const remove = async () => {
		if (!confirm()) return
		try {
			await api(`/api/clients/${c.id}`, { method: "DELETE" })
			router.replace("/clients")
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		}
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<Link href="/clients" className="btn btn-icon"><ArrowLeft className="h-4 w-4 rtl:rotate-180" /></Link>
					<div>
						<h1 className="flex items-center gap-2 text-xl font-bold">{c.name} <StatusBadge status={c.status} /></h1>
						<p className="text-xs text-muted">{t("cl_created")}: {formatDate(c.createdAt, locale, true)} • {t("cl_online")}: {relativeTime(c.lastOnlineAt, locale)}</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button onClick={() => setExtend(true)}>{t("cl_extend")}</Button>
					<Button onClick={reset}><RotateCcw className="h-4 w-4" />{t("cl_reset")}</Button>
					<Button onClick={() => patch({ enabled: c.status === "DISABLED" })} loading={busy}>{c.status === "DISABLED" ? t("cl_enable") : t("cl_disable")}</Button>
					<Button variant="danger" onClick={remove}><Trash2 className="h-4 w-4" />{t("delete")}</Button>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Stat label={t("cl_usage")} value={formatBytes(used)} sub={c.trafficLimit > 0 ? `/ ${formatBytes(c.trafficLimit)} (${pct}%)` : t("unlimited")} accent="violet" />
				<Stat label={t("download")} value={formatBytes(c.usedDown)} accent="cyan" />
				<Stat label={t("upload")} value={formatBytes(c.usedUp)} accent="magenta" />
				<Stat label={t("cl_expiry")} value={c.expiresAt ? (dl !== null && dl > 0 ? `${dl} ${t("days")}` : t("st_EXPIRED")) : t("never")} sub={c.expiresAt ? formatDate(c.expiresAt, locale) : undefined} accent={dl !== null && dl <= 3 ? "warning" : "success"} />
			</div>

			<div className="grid gap-4 xl:grid-cols-3">
				<Card title={t("cl_usage_30d")} className="xl:col-span-2">
					<Progress value={pct} className="mb-4" />
					<UsageAreaChart data={usage} height={220} />
				</Card>

				<Card title={t("cl_sub_link")}>
					<div className="flex flex-col items-center gap-3">
						<QR value={c.subUrl} size={160} />
						<div className="flex w-full items-center gap-2">
							<Input readOnly className="mono text-xs" value={c.subUrl} onFocus={(e) => e.currentTarget.select()} />
							<Button variant="primary" size="icon" onClick={() => copy(c.subUrl)}><Copy className="h-4 w-4" /></Button>
						</div>
						<a className="btn btn-sm w-full" href={c.subUrl.replace("/sub/", "/s/")} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />{t("cl_sub_page")}</a>
					</div>
					<dl className="mt-4 space-y-1.5 text-xs">
						<div className="flex justify-between"><dt className="text-muted">UUID</dt><dd className="mono cursor-pointer truncate ps-3" onClick={() => copy(c.uuid)}>{c.uuid}</dd></div>
						<div className="flex justify-between"><dt className="text-muted">{t("cl_ip_limit")}</dt><dd className="num">{c.ipLimit || t("unlimited")}</dd></div>
						{c.phone && <div className="flex justify-between"><dt className="text-muted">{t("cl_phone")}</dt><dd className="mono">{c.phone}</dd></div>}
						{c.telegramId && <div className="flex justify-between"><dt className="text-muted">{t("cl_telegram")}</dt><dd className="mono">{c.telegramId}</dd></div>}
						{c.note && <div className="flex justify-between"><dt className="text-muted">{t("cl_note")}</dt><dd className="ps-3 text-end">{c.note}</dd></div>}
					</dl>
				</Card>
			</div>

			<Card title={t("cl_servers")} bodyClassName="px-0 pb-0">
				<div className="table-wrap">
					<table className="table">
						<thead><tr><th>{t("nav_servers")}</th><th>Inbound</th><th>Email</th><th>{t("download")}</th><th>{t("upload")}</th><th>{t("status")}</th></tr></thead>
						<tbody>
							{c.servers.map((s) => (
								<tr key={s.id}>
									<td className="font-medium">{s.serverName} <StatusBadge status={s.serverStatus} /></td>
									<td className="num">#{s.inboundId}</td>
									<td className="mono text-xs">{s.remoteEmail}</td>
									<td className="num">{formatBytes(s.down)}</td>
									<td className="num">{formatBytes(s.up)}</td>
									<td>{s.lastError ? <Badge tone="danger">{s.lastError}</Badge> : <Badge tone={s.enabled ? "success" : "muted"}>{s.enabled ? t("enabled") : t("disabled")}</Badge>}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Card>

			<Card title={`${t("cl_links")} (${links.length})`}>
				{links.length === 0 ? <p className="text-sm text-muted">—</p> : (
					<ul className="space-y-2">
						{links.map((l, i) => (
							<li key={i} className="glass glass-2 flex items-center justify-between gap-2 p-3">
								<div className="min-w-0">
									<div className="truncate text-sm font-medium">{l.remark}</div>
									<div className="mono truncate text-[11px] text-muted">{l.uri}</div>
								</div>
								<div className="flex shrink-0 gap-1">
									<Button size="icon" onClick={() => copy(l.uri)}><Copy className="h-4 w-4" /></Button>
									<Button size="icon" onClick={() => setQr(l.uri)}><QrCode className="h-4 w-4" /></Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</Card>

			<Modal open={qr !== null} onClose={() => setQr(null)} title={t("cl_qr")}>
				{qr && <div className="flex flex-col items-center gap-3"><QR value={qr} size={240} /><p className="mono break-all text-[11px] text-muted">{qr}</p></div>}
			</Modal>

			<Modal open={extend} onClose={() => setExtend(false)} title={t("cl_extend")} footer={<Button variant="primary" loading={busy} onClick={async () => { await patch({ addDays: days }); setExtend(false) }}>{t("save")}</Button>}>
				<label className="label">{t("cl_extend_days")}</label>
				<Input type="number" min={-3650} value={days} onChange={(e) => setDays(Number(e.target.value))} />
				<div className="mt-2 flex gap-1.5">{[7, 30, 60, 90, 180, 365].map((d) => <button key={d} type="button" className={`badge cursor-pointer ${days === d ? "badge-cyan" : "badge-muted"}`} onClick={() => setDays(d)}>{d} {t("day_short")}</button>)}</div>
			</Modal>
		</div>
	)
}
