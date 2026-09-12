"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Copy, Layers, Pencil, Plus, QrCode, RotateCcw, Search, Settings2, Trash2, UserPlus } from "lucide-react"
import { ApiError, api, copyText } from "@/lib/client"
import type { ClientDto, ServerDto, ServiceDto } from "@/lib/dto"
import { daysLeft, formatBytes, percent, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { QR } from "@/components/QR"
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Progress, Select, StatusBadge, Textarea, cx, useConfirm, useToast } from "@/components/ui"

const STATUSES = ["", "ACTIVE", "EXPIRED", "LIMITED", "DISABLED"] as const

type Mode = "service" | "manual"
type Form = { name: string; tag: string; serviceId: string; mode: Mode; trafficGB: number; days: number; ipLimit: number; note: string; phone: string; telegramId: string; targets: Array<{ serverId: string; inboundId: number }> }
const emptyForm: Form = { name: "", tag: "", serviceId: "", mode: "manual", trafficGB: 50, days: 30, ipLimit: 0, note: "", phone: "", telegramId: "", targets: [] }

/** Mirrors configLabel() in @srpanel/core so the operator sees the real x-ui name. */
function labelPreview(name: string, tag: string): string {
	const n = name.trim()
	const g = tag.trim()
	if (!g) return n
	return /[-_.|:/\u2022]$/.test(g) ? `${g}${n}` : `${g}-${n}`
}

/** Mirrors groupTargets() in @srpanel/core: one panel client per server+protocol, however many inbounds are picked. */
function configCount(targets: Array<{ serverId: string; inboundId: number }>, servers: ServerDto[]): number {
	const keys = new Set<string>()
	for (const t of targets) {
		const proto = servers.find((s) => s.id === t.serverId)?.inbounds.find((i) => i.id === t.inboundId)?.protocol ?? ""
		keys.add(`${t.serverId}|${proto}`)
	}
	return keys.size
}

export function ClientsClient({ initial, servers, services, openNew, isOwner }: { initial: { items: ClientDto[]; total: number }; servers: ServerDto[]; services: ServiceDto[]; openNew: boolean; isOwner: boolean }) {
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
	const hasServices = services.length > 0
	const firstTargets = () => servers.flatMap((s) => s.inbounds.filter((i) => i.enable).slice(0, 1).map((i) => ({ serverId: s.id, inboundId: i.id }))).slice(0, 1)
	/* services are the only path once the owner defined at least one */
	const newForm = (): Form => (hasServices ? { ...emptyForm, mode: "service", serviceId: services[0].id } : { ...emptyForm, mode: "manual", targets: firstTargets() })
	const [modal, setModal] = useState<"new" | ClientDto | null>(openNew ? "new" : null)
	const [form, setForm] = useState<Form>(() => (openNew ? newForm() : emptyForm))
	const [busy, setBusy] = useState(false)
	const [qr, setQr] = useState<ClientDto | null>(null)

	const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

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

	const openCreate = () => {
		setForm(newForm())
		setModal("new")
	}
	const openEdit = (c: ClientDto) => {
		setForm({
			name: c.name,
			tag: c.tag ?? "",
			serviceId: c.serviceId ?? "",
			mode: c.serviceId ? "service" : "manual",
			trafficGB: Math.round((c.trafficLimit / 1024 ** 3) * 100) / 100,
			days: 0,
			ipLimit: c.ipLimit,
			note: c.note ?? "",
			phone: c.phone ?? "",
			telegramId: c.telegramId ?? "",
			targets: c.servers.map((s) => ({ serverId: s.serverId, inboundId: s.inboundId })),
		})
		setModal(c)
	}
	const toggleTarget = (serverId: string, inboundId: number) =>
		setForm((f) => {
			const has = f.targets.some((x) => x.serverId === serverId && x.inboundId === inboundId)
			return { ...f, targets: has ? f.targets.filter((x) => !(x.serverId === serverId && x.inboundId === inboundId)) : [...f.targets, { serverId, inboundId }] }
		})

	const creating = modal === "new"
	const serviceMode = hasServices && form.mode === "service"
	const selectedService = services.find((s) => s.id === form.serviceId) ?? null
	const showManualPicker = !creating || !serviceMode
	const incomplete = creating && (serviceMode ? !form.serviceId : form.targets.length === 0)
	/* one config per server (per protocol) - several inbounds of one server land on a single panel client */
	const manualConfigs = useMemo(() => configCount(form.targets, servers), [form.targets, servers])
	const serviceConfigs = selectedService ? new Set(selectedService.targets.map((x) => x.serverId)).size : 0

	const submit = async (e: FormEvent) => {
		e.preventDefault()
		setBusy(true)
		try {
			if (creating) {
				const r = await api<{ client: ClientDto; errors: string[] }>("/api/clients", {
					method: "POST",
					json: {
						name: form.name.trim(),
						tag: form.tag.trim() || null,
						trafficGB: Number(form.trafficGB),
						days: Number(form.days),
						ipLimit: Number(form.ipLimit),
						note: form.note || null,
						phone: form.phone || null,
						telegramId: form.telegramId || null,
						...(serviceMode ? { serviceId: form.serviceId } : { targets: form.targets }),
					},
				})
				setItems((l) => [r.client, ...l])
				setTotal((n) => n + 1)
				if (r.errors.length) toast.err(`${t("cl_partial_error")} ${r.errors.join(" | ")}`)
				else toast.ok(t("set_saved"))
				setModal(null)
				setQr(r.client)
			} else if (modal) {
				const r = await api<{ client: ClientDto; errors: string[] }>(`/api/clients/${modal.id}`, {
					method: "PATCH",
					json: { name: form.name.trim(), tag: form.tag.trim() || null, trafficGB: Number(form.trafficGB), addDays: Number(form.days) || undefined, ipLimit: Number(form.ipLimit), note: form.note || null, phone: form.phone || null, telegramId: form.telegramId || null },
				})
				setItems((l) => l.map((x) => (x.id === r.client.id ? r.client : x)))
				if (r.errors.length) toast.err(`${t("cl_partial_error")} ${r.errors.join(" | ")}`)
				else toast.ok(t("set_saved"))
				setModal(null)
			}
			router.refresh()
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setBusy(false)
		}
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

	const serverMap = useMemo(() => new Map(servers.map((s) => [s.id, s])), [servers])
	const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])

	return (
		<div>
			<PageHeader title={`${t("cl_title")} (${total})`} subtitle={t("cl_sub")} actions={<Button variant="primary" onClick={openCreate}><UserPlus className="h-4 w-4" />{t("cl_add")}</Button>} />

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
					<Empty text={t("cl_empty")} action={<Button variant="primary" size="sm" onClick={openCreate}><Plus className="h-4 w-4" />{t("cl_add")}</Button>} />
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr>
									<th>{t("name")}</th>
									<th>{t("status")}</th>
									<th className="min-w-44">{t("cl_usage")}</th>
									<th>{t("cl_expiry")}</th>
									<th>{t("cl_servers")}</th>
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
									return (
										<tr key={c.id}>
											<td>
												<div className="flex flex-wrap items-center gap-1.5">
													{c.tag && <Badge tone="violet">{c.tag}</Badge>}
													<Link href={`/clients/${c.id}`} className="font-medium hover:text-violet-soft">{c.name}</Link>
												</div>
												{svc && <div className="text-[11px] text-muted">{svc.name}</div>}
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
												<div className="flex flex-wrap gap-1">
													{c.servers.map((s) => <Badge key={s.id} tone={s.lastError ? "danger" : s.serverStatus === "ONLINE" ? "cyan" : "muted"}>{s.serverName}</Badge>)}
												</div>
											</td>
											<td className="text-xs text-muted">{relativeTime(c.lastOnlineAt, locale)}</td>
											<td>
												<div className="flex justify-end gap-1">
													<Button size="icon" variant="ghost" title={t("copy")} onClick={() => copySub(c)}><Copy className="h-4 w-4" /></Button>
													<Button size="icon" variant="ghost" title={t("cl_qr")} onClick={() => setQr(c)}><QrCode className="h-4 w-4" /></Button>
													<Button size="icon" variant="ghost" title={t("edit")} onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
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

			{/* create / edit */}
			<Modal open={modal !== null} onClose={() => setModal(null)} title={creating ? t("cl_add") : t("cl_edit")} wide footer={<Button variant="primary" type="submit" form="client-form" loading={busy} disabled={incomplete}>{creating ? t("create") : t("save")}</Button>}>
				<form id="client-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
					<div className="space-y-3">
						<div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
							<Field label={t("name")}><Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder={t("cl_name_ph")} /></Field>
							<Field label={L("تگ", "Tag")}><Input value={form.tag} onChange={(e) => set("tag", e.target.value)} maxLength={24} placeholder={L("مثلاً SR", "e.g. SR")} /></Field>
						</div>
						<p className="text-[11px] text-muted">
							{L("نام کانفیگ روی پنل: ", "Config name on the panel: ")}
							<span className="mono text-violet-soft" dir="ltr">{labelPreview(form.name, form.tag) || "—"}</span>
						</p>
						{!creating && <p className="text-[11px] text-warning">{L("کانفیگ‌هایی که قبلاً ساخته شده‌اند نامشان روی x-ui تغییر نمی‌کند (مصرف ثبت‌شده گم می‌شود)؛ نام جدید در لینک اشتراک دیده می‌شود.", "Already-created configs keep their x-ui name (renaming would drop their traffic counters); the new name shows up in the subscription.")}</p>}
						<div className="grid grid-cols-2 gap-3">
							<Field label={t("cl_traffic_gb")}><Input type="number" min={0} step="0.5" value={form.trafficGB} onChange={(e) => set("trafficGB", Number(e.target.value))} /></Field>
							<Field label={creating ? t("cl_days") : t("cl_extend_days")}><Input type="number" min={creating ? 0 : -3650} value={form.days} onChange={(e) => set("days", Number(e.target.value))} /></Field>
						</div>
						<div className="flex flex-wrap gap-1.5">
							{[10, 30, 50, 100, 200].map((g) => <button key={g} type="button" className={cx("chip", form.trafficGB === g && "chip-on")} onClick={() => set("trafficGB", g)}>{g} GB</button>)}
							<button type="button" className={cx("chip", form.trafficGB === 0 && "chip-on")} onClick={() => set("trafficGB", 0)}>∞</button>
							<span className="mx-1 opacity-30">|</span>
							{[30, 60, 90, 180].map((d) => <button key={d} type="button" className={cx("chip", form.days === d && "chip-on")} onClick={() => set("days", d)}>{d} {t("day_short")}</button>)}
						</div>
						<div className="grid grid-cols-2 gap-3">
							<Field label={t("cl_ip_limit")}><Input type="number" min={0} value={form.ipLimit} onChange={(e) => set("ipLimit", Number(e.target.value))} /></Field>
							<Field label={t("cl_phone")}><Input className="mono text-start" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0912…" /></Field>
						</div>
						<Field label={t("cl_telegram")}><Input className="mono text-start" value={form.telegramId} onChange={(e) => set("telegramId", e.target.value)} placeholder="@username" /></Field>
						<Field label={t("cl_note")}><Textarea value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
					</div>

					<div>
						{hasServices && (creating || !!form.serviceId) && (
							<div className={cx("mb-4", showManualPicker && "border-b pb-4")}>
								<div className="label flex items-center gap-1.5">
									<Layers className="h-3.5 w-3.5 text-violet-soft" />
									{L("سرویس", "Service")}
								</div>
								<p className="mb-2 text-[11px] text-muted">{L("سرویس مجموعه‌ای از اینباندهاست که مالک تعریف کرده؛ کافی‌ست یکی را انتخاب کنید.", "A service is an owner-defined bundle of inbounds - just pick one.")}</p>
								<div className="scrollbar-thin max-h-72 space-y-2 overflow-y-auto pe-1">
									{services.map((svc) => {
										const on = form.serviceId === svc.id
										const cfgs = new Set(svc.targets.map((x) => x.serverId)).size
										return (
											<button key={svc.id} type="button" disabled={!creating} onClick={() => set("serviceId", svc.id)} className={cx("pick", on && "pick-on", !creating && "cursor-default")}>
												<div className="flex items-center justify-between gap-2">
													<span className="flex min-w-0 items-center gap-2 text-sm font-medium">
														<span className={cx("h-3.5 w-3.5 shrink-0 rounded-full border-2", on ? "border-violet-soft bg-violet" : "border-line")} />
														<span className="truncate">{svc.name}</span>
													</span>
													<Badge tone={on ? "violet" : "muted"}>{cfgs} {L("کانفیگ", "configs")}</Badge>
												</div>
												{svc.description && <p className="mt-1 text-[11px] text-muted">{svc.description}</p>}
												<div className="mt-1.5 flex flex-wrap gap-1">
													{svc.targets.slice(0, 6).map((x) => (
														<span key={x.serverId + ":" + x.inboundId} className="badge badge-muted max-w-full">
															<span className="truncate">{x.serverName}</span>
															<span className="mono truncate opacity-70" dir="ltr">{x.inboundLabel}</span>
														</span>
													))}
													{svc.targets.length > 6 && <span className="badge badge-muted num">+{svc.targets.length - 6}</span>}
												</div>
											</button>
										)
									})}
								</div>
								{selectedService && (
									<p className="pt-2 text-[11px] text-muted">{L(`${serviceConfigs} کانفیگ از ${selectedService.targets.length} اینباند ساخته می‌شود — اینباندهای یک سرور داخل یک کانفیگ جمع می‌شوند.`, `${serviceConfigs} config(s) from ${selectedService.targets.length} inbounds - inbounds of the same server share one config.`)}</p>
								)}
								{creating && isOwner && (
									<Link href="/services" className="mt-2 inline-flex items-center gap-1 text-[11px] text-violet-soft hover:underline">
										<Settings2 className="h-3.5 w-3.5" />
										{L("مدیریت سرویس‌ها", "Manage services")}
									</Link>
								)}
							</div>
						)}

						{showManualPicker && (
							<>
								<div className="label">{t("cl_targets")}</div>
								<p className="mb-2 text-[11px] text-muted">{t("cl_targets_hint")}</p>
								{creating && form.targets.length > 0 && (
									<p className="mb-2 text-[11px] text-muted">{L(`${manualConfigs} کانفیگ از ${form.targets.length} اینباند ساخته می‌شود — چند اینباند از یک سرور روی یک کانفیگ می‌نشیند.`, `${manualConfigs} config(s) from ${form.targets.length} inbounds - several inbounds of one server share a single config.`)}</p>
								)}
								{!creating && <p className="mb-2 text-[11px] text-warning">{t("cl_servers")}: {form.targets.map((x) => serverMap.get(x.serverId)?.name ?? x.serverId).join(", ") || "—"}</p>}
								<div className="scrollbar-thin max-h-80 space-y-2 overflow-y-auto pe-1">
									{servers.length === 0 && <p className="text-xs text-muted">{t("srv_empty")}</p>}
									{servers.map((s) => (
										<div key={s.id} className="tile">
											<div className="mb-2 flex items-center justify-between">
												<span className="text-sm font-medium">{s.name}</span>
												<StatusBadge status={s.status} />
											</div>
											<div className="flex flex-wrap gap-1.5">
												{s.inbounds.length === 0 && <span className="text-[11px] text-muted">—</span>}
												{s.inbounds.map((i) => {
													const on = form.targets.some((x) => x.serverId === s.id && x.inboundId === i.id)
													return (
														<button key={i.id} type="button" disabled={!creating || !i.enable} onClick={() => toggleTarget(s.id, i.id)} className={cx("chip", on && "chip-on")}>
															{i.protocol}:{i.port}{i.remark ? ` • ${i.remark}` : ""}{i.security !== "none" ? ` • ${i.security}` : ""}
														</button>
													)
												})}
											</div>
										</div>
									))}
								</div>
							</>
						)}
					</div>
				</form>
			</Modal>

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
