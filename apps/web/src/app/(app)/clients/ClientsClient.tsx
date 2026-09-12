"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Copy, Pencil, Plus, QrCode, RotateCcw, Search, Trash2, UserPlus } from "lucide-react"
import { ApiError, api, copyText } from "@/lib/client"
import type { ClientDto, ServiceDto } from "@/lib/dto"
import { daysLeft, formatBytes, percent, relativeTime } from "@/lib/format"
import { tr, useLocale, useT } from "@/lib/i18n"
import { QR } from "@/components/QR"
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Progress, Select, StatusBadge, cx, useConfirm, useToast } from "@/components/ui"
import { ClientForm } from "./ClientForm"

const STATUSES = ["", "ACTIVE", "EXPIRED", "LIMITED", "DISABLED"] as const

export function ClientsClient({ initial, services, openNew, isOwner }: { initial: { items: ClientDto[]; total: number }; services: ServiceDto[]; openNew: boolean; isOwner: boolean }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const confirm = useConfirm()
	const router = useRouter()

	const [items, setItems] = useState(initial.items)
	const [total, setTotal] = useState(initial.total)
	const [q, setQ] = useState("")
	const [status, setStatus] = useState<string>("")
	const [loading, setLoading] = useState(false)
	const [modal, setModal] = useState<"new" | ClientDto | null>(openNew ? "new" : null)
	const [qr, setQr] = useState<ClientDto | null>(null)

	// live search (debounced)
	useEffect(() => {
		const h = setTimeout(async () => {
			setLoading(true)
			try {
				const r = await api<{ items: ClientDto[]; total: number }>(`/api/clients?q=${encodeURIComponent(q)}&status=${status}&take=100`)
				setItems(r.items)
				setTotal(r.total)
			} catch {
				/* ignore */
			} finally {
				setLoading(false)
			}
		}, q ? 300 : 0)
		return () => clearTimeout(h)
	}, [q, status])

	const saved = (c: ClientDto, created: boolean) => {
		if (created) {
			setItems((l) => [c, ...l])
			setTotal((n) => n + 1)
			setQr(c)
		} else {
			setItems((l) => l.map((x) => (x.id === c.id ? c : x)))
		}
		setModal(null)
		router.refresh()
	}

	const reset = async (c: ClientDto) => {
		if (!confirm(`${t("cl_reset")}: ${c.name}?`)) return
		try {
			const r = await api<{ client: ClientDto; errors: string[] }>(`/api/clients/${c.id}/reset`, { method: "POST" })
			setItems((l) => l.map((x) => (x.id === c.id ? r.client : x)))
			r.errors.length ? toast.err(r.errors.join(" | ")) : toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		}
	}
	const toggle = async (c: ClientDto) => {
		try {
			const r = await api<{ client: ClientDto; errors: string[] }>(`/api/clients/${c.id}`, { method: "PATCH", json: { enabled: c.status === "DISABLED" } })
			setItems((l) => l.map((x) => (x.id === c.id ? r.client : x)))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		}
	}
	const remove = async (c: ClientDto) => {
		if (!confirm(`${t("delete")} «${c.name}» — ${t("confirm_delete")}`)) return
		try {
			await api(`/api/clients/${c.id}`, { method: "DELETE" })
			setItems((l) => l.filter((x) => x.id !== c.id))
			setTotal((n) => n - 1)
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		}
	}
	const copySub = async (c: ClientDto) => {
		(await copyText(c.subUrl)) ? toast.ok(t("copied")) : toast.err(t("error_generic"))
	}

	const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])

	return (
		<div>
			<PageHeader title={`${t("cl_title")} (${total})`} subtitle={t("cl_sub")} actions={<Button variant="primary" onClick={() => setModal("new")}><UserPlus className="h-4 w-4" />{t("cl_add")}</Button>} />

			<div className="mb-4 flex flex-wrap items-center gap-2">
				<div className="relative min-w-56 flex-1">
					<Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted" />
					<Input className="ps-10" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
				</div>
				<Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
					{STATUSES.map((s) => (
						<option key={s} value={s}>{s ? t(`st_${s}` as any) : t("all")}</option>
					))}
				</Select>
			</div>

			<Card bodyClassName="px-0 pb-0" className={cx(loading && "opacity-70")}>
				{items.length === 0 ? (
					<Empty text={t("cl_empty")} action={<Button variant="primary" size="sm" onClick={() => setModal("new")}><Plus className="h-4 w-4" />{t("cl_add")}</Button>} />
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr>
									<th>{t("name")}</th>
									<th>{t("status")}</th>
									<th className="min-w-44">{t("cl_usage")}</th>
									<th>{t("cl_expiry")}</th>
									<th>{L("سرویس", "Service")}</th>
									<th>{t("cl_online")}</th>
									<th className="text-end">{t("actions")}</th>
								</tr>
							</thead>
							<tbody>
								{items.map((c) => {
									const used = c.usedUp + c.usedDown
									const pct = c.trafficLimit > 0 ? percent(used, c.trafficLimit) : 0
									const dl = daysLeft(c.expiresAt)
									const svc = c.serviceId ? serviceMap.get(c.serviceId) : undefined
									// one client row can touch the same server several times (one per inbound)
									const serverNames = [...new Set(c.servers.map((s) => s.serverName))]
									const broken = c.servers.some((s) => !!s.lastError)
									return (
										<tr key={c.id}>
											<td>
												<div className="flex flex-wrap items-center gap-1.5">
													{c.tag && <Badge tone="violet">{c.tag}</Badge>}
													<Link href={`/clients/${c.id}`} className="font-medium hover:text-violet-soft">{c.name}</Link>
												</div>
												{c.note && <div className="max-w-48 truncate text-[11px] text-muted">{c.note}</div>}
											</td>
											<td><StatusBadge status={c.status} /></td>
											<td>
												<div className="mb-1 flex justify-between text-[11px] text-muted"><span className="num">{formatBytes(used)}</span><span className="num">{c.trafficLimit > 0 ? formatBytes(c.trafficLimit) : "∞"}</span></div>
												<Progress value={pct} />
											</td>
											<td className="text-xs">
												{c.expiresAt ? <span className={cx("num", dl !== null && dl <= 3 && "text-warning", dl !== null && dl <= 0 && "text-danger")}>{dl !== null && dl > 0 ? `${dl} ${t("days")}` : t("st_EXPIRED")}</span> : <span className="text-muted">{t("never")}</span>}
											</td>
											<td>
												{svc ? (
													<Badge tone={broken ? "danger" : "violet"}>{svc.name}</Badge>
												) : serverNames.length > 0 ? (
													<Badge tone={broken ? "danger" : "muted"}>{serverNames.join(" ، ")}</Badge>
												) : (
													<span className="text-xs text-muted">—</span>
												)}
												{c.servers.length > 0 && <div className="num mt-1 text-[11px] text-muted">{c.servers.length} {L("کانفیگ", "configs")}</div>}
											</td>
											<td className="text-xs text-muted">{relativeTime(c.lastOnlineAt, locale)}</td>
											<td>
												<div className="flex justify-end gap-1">
													<Button size="icon" variant="ghost" title={t("copy")} onClick={() => copySub(c)}><Copy className="h-4 w-4" /></Button>
													<Button size="icon" variant="ghost" title={t("cl_qr")} onClick={() => setQr(c)}><QrCode className="h-4 w-4" /></Button>
													<Button size="icon" variant="ghost" title={t("edit")} onClick={() => setModal(c)}><Pencil className="h-4 w-4" /></Button>
													<Button size="icon" variant="ghost" title={t("cl_reset")} onClick={() => reset(c)}><RotateCcw className="h-4 w-4" /></Button>
													<Button size="sm" variant="ghost" onClick={() => toggle(c)}>{c.status === "DISABLED" ? t("cl_enable") : t("cl_disable")}</Button>
													<Button size="icon" variant="danger" title={t("delete")} onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></Button>
												</div>
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				)}
			</Card>

			{/* create / edit - service only, no inbound picker */}
			{modal !== null && (
				<ClientForm
					key={modal === "new" ? "new" : modal.id}
					client={modal === "new" ? null : modal}
					services={services}
					isOwner={isOwner}
					onClose={() => setModal(null)}
					onSaved={saved}
				/>
			)}

			{/* QR / sub link */}
			<Modal open={qr !== null} onClose={() => setQr(null)} title={qr ? `${t("cl_sub_link")} — ${qr.name}` : ""}>
				{qr && (
					<div className="flex flex-col items-center gap-4">
						<QR value={qr.subUrl} size={220} />
						<div className="flex w-full items-center gap-2">
							<Input readOnly className="mono text-xs" value={qr.subUrl} onFocus={(e) => e.currentTarget.select()} />
							<Button variant="primary" onClick={() => copySub(qr)}><Copy className="h-4 w-4" /></Button>
						</div>
						<div className="flex gap-2">
							<a className="btn btn-sm" href={qr.subUrl.replace("/sub/", "/s/")} target="_blank" rel="noreferrer">{t("cl_sub_page")}</a>
							<Link className="btn btn-sm" href={`/clients/${qr.id}`}>{t("cl_links")}</Link>
						</div>
					</div>
				)}
			</Modal>
		</div>
	)
}
