"use client"

import { useMemo, useState, type FormEvent } from "react"
import { Layers, Pencil, Plus, Trash2, Users } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import type { ServerDto, ServiceDto } from "@/lib/dto"
import { useLocale } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, StatusBadge, Switch, Textarea, cx, useConfirm, useToast } from "@/components/ui"

type AdminLite = { id: string; username: string; displayName: string | null }
type Target = { serverId: string; inboundId: number }
type Form = { name: string; description: string; targets: Target[]; adminIds: string[]; isActive: boolean; sortOrder: number }

const emptyForm: Form = { name: "", description: "", targets: [], adminIds: [], isActive: true, sortOrder: 0 }

/**
 * Services let the owner wrap a set of inbounds under one name ("تانل", "ریلی", …).
 * Resellers then pick the service instead of hand-picking inbounds they don't
 * necessarily understand.
 */
export function ServicesClient({ initial, servers, admins }: { initial: ServiceDto[]; servers: ServerDto[]; admins: AdminLite[] }) {
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const toast = useToast()
	const confirm = useConfirm()

	const [items, setItems] = useState<ServiceDto[]>(initial)
	const [modal, setModal] = useState<"new" | ServiceDto | null>(null)
	const [form, setForm] = useState<Form>(emptyForm)
	const [busy, setBusy] = useState(false)

	const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
	const adminName = (a: AdminLite) => a.displayName || a.username
	const adminMap = useMemo(() => new Map(admins.map((a) => [a.id, a])), [admins])

	const reload = async () => {
		try {
			const r = await api<{ services: ServiceDto[] }>("/api/services")
			setItems(r.services)
		} catch {
			/* keep the current list */
		}
	}

	const openCreate = () => {
		setForm(emptyForm)
		setModal("new")
	}
	const openEdit = (s: ServiceDto) => {
		setForm({ name: s.name, description: s.description ?? "", targets: s.targets.map((t) => ({ serverId: t.serverId, inboundId: t.inboundId })), adminIds: [...s.adminIds], isActive: s.isActive, sortOrder: s.sortOrder })
		setModal(s)
	}
	const toggleTarget = (serverId: string, inboundId: number) =>
		setForm((f) => {
			const has = f.targets.some((x) => x.serverId === serverId && x.inboundId === inboundId)
			return { ...f, targets: has ? f.targets.filter((x) => !(x.serverId === serverId && x.inboundId === inboundId)) : [...f.targets, { serverId, inboundId }] }
		})
	const toggleAdmin = (id: string) =>
		setForm((f) => ({ ...f, adminIds: f.adminIds.includes(id) ? f.adminIds.filter((x) => x !== id) : [...f.adminIds, id] }))
	const toggleServer = (s: ServerDto) =>
		setForm((f) => {
			const enabled = s.inbounds.filter((i) => i.enable)
			const allOn = enabled.length > 0 && enabled.every((i) => f.targets.some((x) => x.serverId === s.id && x.inboundId === i.id))
			const rest = f.targets.filter((x) => x.serverId !== s.id)
			return { ...f, targets: allOn ? rest : [...rest, ...enabled.map((i) => ({ serverId: s.id, inboundId: i.id }))] }
		})

	const submit = async (e: FormEvent) => {
		e.preventDefault()
		setBusy(true)
		try {
			const json = {
				name: form.name.trim(),
				description: form.description.trim() || null,
				targets: form.targets,
				adminIds: form.adminIds,
				isActive: form.isActive,
				sortOrder: Number(form.sortOrder) || 0,
			}
			if (modal === "new") await api("/api/services", { method: "POST", json })
			else if (modal) await api(`/api/services/${modal.id}`, { method: "PATCH", json })
			await reload()
			toast.ok(L("ذخیره شد", "Saved"))
			setModal(null)
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : L("خطای غیرمنتظره", "Unexpected error"))
		} finally {
			setBusy(false)
		}
	}

	const toggleActive = async (s: ServiceDto) => {
		try {
			await api(`/api/services/${s.id}`, { method: "PATCH", json: { isActive: !s.isActive } })
			setItems((l) => l.map((x) => (x.id === s.id ? { ...x, isActive: !s.isActive } : x)))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : L("خطا", "Error"))
		}
	}
	const remove = async (s: ServiceDto) => {
		if (!confirm(L(`سرویس «${s.name}» حذف شود؟ کلاینت‌های ساخته‌شده دست‌نخورده می‌مانند.`, `Delete service “${s.name}”? Existing clients stay untouched.`))) return
		try {
			await api(`/api/services/${s.id}`, { method: "DELETE" })
			setItems((l) => l.filter((x) => x.id !== s.id))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : L("خطا", "Error"))
		}
	}

	const selectedCount = form.targets.length

	return (
		<div>
			<PageHeader
				title={`${L("سرویس\u200cها", "Services")} (${items.length})`}
				subtitle={L("چند اینباند را در یک سرویس بسته‌بندی کنید تا ادمین‌ها فقط نام سرویس را انتخاب کنند", "Bundle inbounds into one service so admins only pick a service")}
				actions={
					<Button variant="primary" onClick={openCreate}>
						<Plus className="h-4 w-4" />
						{L("سرویس جدید", "New service")}
					</Button>
				}
			/>

			{items.length === 0 ? (
				<Card>
					<Empty
						text={L("هنوز سرویسی نساخته‌اید — مثلاً «تانل» را بسازید و اینباندهایش را انتخاب کنید.", "No service yet - create one (e.g. “Tunnel”) and pick its inbounds.")}
						action={
							<Button variant="primary" size="sm" onClick={openCreate}>
								<Plus className="h-4 w-4" />
								{L("سرویس جدید", "New service")}
							</Button>
						}
					/>
				</Card>
			) : (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{items.map((s) => (
						<Card
							key={s.id}
							className={cx("h-full", !s.isActive && "opacity-70")}
							title={
								<span className="flex items-center gap-2">
									<Layers className="h-4 w-4 text-violet-soft" />
									{s.name}
								</span>
							}
							subtitle={s.description ?? undefined}
							actions={
								<>
									<Button size="icon" variant="ghost" title={L("ویرایش", "Edit")} onClick={() => openEdit(s)}>
										<Pencil className="h-4 w-4" />
									</Button>
									<Button size="icon" variant="danger" title={L("حذف", "Delete")} onClick={() => remove(s)}>
										<Trash2 className="h-4 w-4" />
									</Button>
								</>
							}
						>
							<div className="mb-3 flex flex-wrap items-center gap-2">
								<StatusBadge status={s.isActive ? "ACTIVE" : "DISABLED"} />
								<Badge tone="violet">{s.targets.length + " " + L("اینباند", "inbounds")}</Badge>
								<Badge tone="muted">{new Set(s.targets.map((t) => t.serverId)).size + " " + L("سرور", "servers")}</Badge>
							</div>

							<div className="scrollbar-thin max-h-40 space-y-1 overflow-y-auto pe-1">
								{s.targets.length === 0 && <p className="text-xs text-warning">{L("هیچ اینباندی معتبر نیست — ویرایش کنید.", "No valid inbound - please edit.")}</p>}
								{s.targets.map((t) => (
									<div key={t.serverId + ":" + t.inboundId} className="flex items-center justify-between gap-2 text-[11px]">
										<span className="truncate text-muted">{t.serverName}</span>
										<span className={cx("mono truncate", !t.enabled && "text-danger")} dir="ltr">
											{t.inboundLabel}
										</span>
									</div>
								))}
							</div>

							<div className="mt-3 flex items-start gap-2 border-t pt-3 text-[11px] text-muted">
								<Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
								<span className="truncate">{s.adminIds.length === 0 ? L("در دسترس همهٔ ادمین‌ها", "Available to every admin") : s.adminIds.map((id) => adminMap.get(id)).filter(Boolean).map((a) => adminName(a as AdminLite)).join(", ")}</span>
							</div>

							<div className="mt-3">
								<Button size="sm" variant="ghost" onClick={() => toggleActive(s)}>
									{s.isActive ? L("غیرفعال کردن", "Disable") : L("فعال کردن", "Enable")}
								</Button>
							</div>
						</Card>
					))}
				</div>
			)}

			<Modal
				open={modal !== null}
				onClose={() => setModal(null)}
				title={modal === "new" ? L("سرویس جدید", "New service") : L("ویرایش سرویس", "Edit service")}
				wide
				footer={
					<Button variant="primary" type="submit" form="service-form" loading={busy} disabled={selectedCount === 0 || !form.name.trim()}>
						{modal === "new" ? L("ساختن", "Create") : L("ذخیره", "Save")}
					</Button>
				}
			>
				<form id="service-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
					<div className="space-y-3">
						<Field label={L("نام سرویس", "Service name")} hint={L("همین نام را ادمین‌ها می‌بینند", "Admins see exactly this name")}>
							<Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder={L("تانل", "Tunnel")} />
						</Field>
						<Field label={L("توضیح", "Description")}>
							<Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder={L("مثلاً: مناسب اپراتور ایرانسل", "e.g. best for mobile operators")} />
						</Field>
						<div className="grid grid-cols-2 items-end gap-3">
							<Field label={L("ترتیب نمایش", "Sort order")}>
								<Input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} />
							</Field>
							<div className="pb-2">
								<Switch checked={form.isActive} onChange={(v) => set("isActive", v)} label={L("فعال", "Active")} />
							</div>
						</div>

						<div>
							<div className="label">{L("دسترسی ادمین‌ها", "Admin access")}</div>
							<p className="mb-2 text-[11px] text-muted">{L("اگر هیچ‌کس را انتخاب نکنید، همهٔ ادمین‌ها می‌توانند از این سرویس استفاده کنند.", "Pick nobody and every admin may use this service.")}</p>
							<div className="flex flex-wrap gap-1.5">
								{admins.length === 0 && <span className="text-[11px] text-muted">{L("ادمینی ثبت نشده", "No admins yet")}</span>}
								{admins.map((a) => (
									<button key={a.id} type="button" onClick={() => toggleAdmin(a.id)} className={cx("badge cursor-pointer", form.adminIds.includes(a.id) ? "badge-cyan" : "badge-muted")}>
										{adminName(a)}
									</button>
								))}
							</div>
						</div>
					</div>

					<div>
						<div className="label">{L("اینباندهای این سرویس", "Inbounds of this service")}</div>
						<p className="mb-2 text-[11px] text-muted">{L("هر کلاینتی که با این سرویس ساخته شود، روی همهٔ این اینباندها ساخته می‌شود.", "A client created with this service is provisioned on all of them.")}</p>
						<p className="mb-2 text-[11px] text-violet-soft">{selectedCount + " " + L("اینباند انتخاب شده", "inbounds selected")}</p>
						<div className="scrollbar-thin max-h-80 space-y-2 overflow-y-auto pe-1">
							{servers.length === 0 && <p className="text-xs text-muted">{L("اول یک سرور اضافه کنید", "Add a server first")}</p>}
							{servers.map((s) => (
								<div key={s.id} className="glass glass-2 p-3">
									<div className="mb-2 flex items-center justify-between gap-2">
										<span className="text-sm font-medium">{s.name}</span>
										<div className="flex items-center gap-2">
											<button type="button" className="text-[11px] text-violet-soft hover:underline" onClick={() => toggleServer(s)}>
												{L("همه/هیچ", "All/none")}
											</button>
											<StatusBadge status={s.status} />
										</div>
									</div>
									<div className="flex flex-wrap gap-1.5">
										{s.inbounds.length === 0 && <span className="text-[11px] text-muted">—</span>}
										{s.inbounds.map((i) => {
											const on = form.targets.some((x) => x.serverId === s.id && x.inboundId === i.id)
											return (
												<button key={i.id} type="button" disabled={!i.enable} onClick={() => toggleTarget(s.id, i.id)} className={cx("badge cursor-pointer disabled:cursor-default disabled:opacity-60", on ? "badge-violet" : "badge-muted")}>
													{i.protocol}:{i.port}
													{i.remark ? ` • ${i.remark}` : ""}
													{i.security !== "none" ? ` • ${i.security}` : ""}
												</button>
											)
										})}
									</div>
								</div>
							))}
						</div>
					</div>
				</form>
			</Modal>
		</div>
	)
}
