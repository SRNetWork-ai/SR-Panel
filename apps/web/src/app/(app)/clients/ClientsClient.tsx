"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Copy, Pencil, Plus, QrCode, RotateCcw, Search, Trash2, UserPlus } from "lucide-react"
import { ApiError, api, copyText } from "@/lib/client"
import type { ClientDto, ServiceDto } from "@/lib/dto"
import { daysLeft, formatBytes, formatNumber, percent, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { QR } from "@/components/QR"
import { Badge, Button, Card, Empty, Input, Modal, PageHeader, Progress, Select, StatusBadge, cx, useConfirm, useToast } from "@/components/ui"
import { ClientForm } from "./ClientForm"
import { CreateClient, servicesForKind, type ClientKind, type ClientTypeAccess } from "./CreateClient"

const STATUSES = ["", "ACTIVE", "EXPIRED", "LIMITED", "DISABLED"] as const

type RefundQuote = { amount: number; unusedGB: number; remainingDays: number }

export function ClientsClient({ initial, services, access, openNew, isOwner }: { initial: { items: ClientDto[]; total: number }; services: ServiceDto[]; access: ClientTypeAccess; openNew: boolean; isOwner: boolean }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const toast = useToast()
	const confirm = useConfirm()
	const router = useRouter()

	const [items, setItems] = useState(initial.items)
	const [total, setTotal] = useState(initial.total)
	const [q, setQ] = useState("")
	const [status, setStatus] = useState<string>("")
	const [loading, setLoading] = useState(false)
	// «client limited» / «client unlimited» get their own form; editing keeps the old one
	const [creating, setCreating] = useState<ClientKind | null>(openNew ? (access.limited ? "LIMITED" : access.unlimited ? "UNLIMITED" : null) : null)
	const [editing, setEditing] = useState<ClientDto | null>(null)
	const [qr, setQr] = useState<ClientDto | null>(null)

	const kinds = useMemo(() => {
		const out: ClientKind[] = []
		if (access.limited) out.push("LIMITED")
		if (access.unlimited) out.push("UNLIMITED")
		return out
	}, [access.limited, access.unlimited])
	const kindLabel = (k: ClientKind) => (k === "LIMITED" ? L("کلاینت حجمی", "Limited client") : L("کلاینت نامحدود", "Unlimited client"))

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
		setCreating(null)
		setEditing(null)
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
		// preview: how much of the purchase comes back to the wallet
		let extra = ""
		try {
			const pre = await api<RefundQuote>(`/api/clients/${c.id}/refund`)
			if (pre.amount > 0) {
				extra = ` — ${L("بازگشت به کیف پول", "Wallet refund")}: ${formatNumber(pre.amount, locale)} ${t("currency_irt")} (${formatNumber(pre.unusedGB, locale)} GB · ${formatNumber(pre.remainingDays, locale)} ${t("days")})`
			}
		} catch {
			/* preview is optional */
		}
		if (!confirm(`${t("delete")} «${c.name}» — ${t("confirm_delete")}${extra}`)) return
		try {
			// DELETE returns the credited amount as a plain number (0 when nothing came back)
			const r = await api<{ errors: string[]; refund: number }>(`/api/clients/${c.id}`, { method: "DELETE" })
			setItems((l) => l.filter((x) => x.id !== c.id))
			setTotal((n) => n - 1)
			if (r.refund > 0) toast.ok(`${L("ریفاند شد", "Refunded")}: ${formatNumber(r.refund, locale)} ${t("currency_irt")}`)
			else if (r.errors?.length) toast.err(r.errors.join(" | "))
			router.refresh()
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
			<PageHeader
				title={`${t("cl_title")} (${total})`}
				subtitle={t("cl_sub")}
				actions={
					kinds.length === 0 ? (
						<span className="text-xs text-warning">{L("مالک به شما اجازهٔ ساخت کلاینت نداده است", "The owner has not granted client creation")}</span>
					) : (
						<div className="flex flex-wrap gap-2">
							{kinds.map((k, i) => (
								<Button key={k} variant={i === 0 ? "primary" : "ghost"} onClick={() => setCreating(k)}>
									<UserPlus className="h-4 w-4" />
									{kindLabel(k)}
								</Button>
							))}
						</div>
					)
				}
			/>

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
					<Empty text={t("cl_empty")} action={kinds.length > 0 ? <Button variant="primary" size="sm" onClick={() => setCreating(kinds[0] ?? null)}><Plus className="h-4 w-4" />{t("cl_add")}</Button> : undefined} />
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
													{c.trafficLimit === 0 && <Badge tone="muted">{L("نامحدود", "Unlimited")}</Badge>}
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
													<Button size="icon" variant="ghost" title={t("edit")} onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
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

			{/* create — one form per client type, services filtered by what the owner offers */}
			{creating !== null && (
				<CreateClient
					key={creating}
					kind={creating}
					services={servicesForKind(services, access, creating)}
					isOwner={isOwner}
					onClose={() => setCreating(null)}
					onSaved={saved}
				/>
			)}

			{/* edit — service only, no inbound picker */}
			{editing !== null && (
				<ClientForm
					key={editing.id}
					client={editing}
					services={services}
					isOwner={isOwner}
					onClose={() => setEditing(null)}
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
