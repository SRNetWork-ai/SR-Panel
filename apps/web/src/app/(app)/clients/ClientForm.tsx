"use client"

import Link from "next/link"
import { useMemo, useState, type FormEvent } from "react"
import { Hourglass, Layers, Settings2 } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import type { ClientDto, ServiceDto } from "@/lib/dto"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Field, Input, Modal, Textarea, cx, useToast } from "@/components/ui"

type Form = {
	name: string
	tag: string
	serviceId: string
	trafficGB: number
	days: number
	startAfterUse: boolean
	ipLimit: number
	note: string
	phone: string
	telegramId: string
}

type SaveResult = { client: ClientDto; errors: string[] }

/** Mirrors configLabel() in @srpanel/core so the operator sees the real x-ui name. */
function labelPreview(name: string, tag: string): string {
	const n = name.trim()
	const g = tag.trim()
	if (!g) return n
	return /[-_.|:/\u2022]$/.test(g) ? `${g}${n}` : `${g}-${n}`
}

const initialForm = (client: ClientDto | null, services: ServiceDto[]): Form =>
	client
		? {
				name: client.name,
				tag: client.tag ?? "",
				serviceId: client.serviceId ?? "",
				trafficGB: Math.round((client.trafficLimit / 1024 ** 3) * 100) / 100,
				days: 0,
				startAfterUse: false,
				ipLimit: client.ipLimit,
				note: client.note ?? "",
				phone: client.phone ?? "",
				telegramId: client.telegramId ?? "",
			}
		: { name: "", tag: "", serviceId: services[0]?.id ?? "", trafficGB: 50, days: 30, startAfterUse: false, ipLimit: 0, note: "", phone: "", telegramId: "" }

/**
 * Create / edit a client.
 * The operator only ever picks a *service* - servers and inbounds are resolved
 * server-side from the service definition, so no inbound UI is exposed here.
 */
export function ClientForm({ client, services, isOwner, onClose, onSaved }: { client: ClientDto | null; services: ServiceDto[]; isOwner: boolean; onClose: () => void; onSaved: (client: ClientDto, created: boolean) => void }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const toast = useToast()
	const creating = client === null
	const [form, setForm] = useState<Form>(() => initialForm(client, services))
	const [busy, setBusy] = useState(false)
	const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

	const selected = useMemo(() => services.find((s) => s.id === form.serviceId) ?? null, [services, form.serviceId])
	const configs = useMemo(() => (selected ? new Set(selected.targets.map((x) => x.serverId)).size : 0), [selected])
	const noServices = services.length === 0
	const delayed = creating && form.startAfterUse
	const incomplete = creating && (noServices || !form.serviceId || (form.startAfterUse && Number(form.days) <= 0))

	const submit = async (e: FormEvent) => {
		e.preventDefault()
		setBusy(true)
		try {
			const body = {
				name: form.name.trim(),
				tag: form.tag.trim() || null,
				trafficGB: Number(form.trafficGB),
				ipLimit: Number(form.ipLimit),
				note: form.note || null,
				phone: form.phone || null,
				telegramId: form.telegramId || null,
			}
			const r = client
				? await api<SaveResult>(`/api/clients/${client.id}`, { method: "PATCH", json: { ...body, addDays: Number(form.days) || undefined } })
				: await api<SaveResult>("/api/clients", { method: "POST", json: { ...body, days: Number(form.days), startAfterUse: form.startAfterUse, serviceId: form.serviceId } })
			if (r.errors.length) toast.err(`${t("cl_partial_error")} ${r.errors.join(" | ")}`)
			else toast.ok(t("set_saved"))
			onSaved(r.client, client === null)
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setBusy(false)
		}
	}

	return (
		<Modal
			open
			onClose={onClose}
			title={creating ? t("cl_add") : t("cl_edit")}
			wide
			footer={
				<Button variant="primary" type="submit" form="client-form" loading={busy} disabled={incomplete}>
					{creating ? t("create") : t("save")}
				</Button>
			}
		>
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
						<Field label={creating ? (form.startAfterUse ? L("روز (از اولین اتصال)", "Days (from first use)") : t("cl_days")) : t("cl_extend_days")}><Input type="number" min={creating ? 0 : -3650} value={form.days} onChange={(e) => set("days", Number(e.target.value))} /></Field>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{[10, 30, 50, 100, 200].map((g) => <button key={g} type="button" className={cx("chip", form.trafficGB === g && "chip-on")} onClick={() => set("trafficGB", g)}>{g} GB</button>)}
						<button type="button" className={cx("chip", form.trafficGB === 0 && "chip-on")} onClick={() => set("trafficGB", 0)}>∞</button>
						<span className="mx-1 opacity-30">|</span>
						{[30, 60, 90, 180].map((d) => <button key={d} type="button" className={cx("chip", form.days === d && "chip-on")} onClick={() => set("days", d)}>{d} {t("day_short")}</button>)}
					</div>

					{creating && (
						<div className={cx("tile space-y-1.5", delayed && "ring-1 ring-violet-soft/40")}>
							<label className="flex cursor-pointer items-center gap-2">
								<input type="checkbox" className="h-4 w-4" checked={form.startAfterUse} onChange={(e) => set("startAfterUse", e.target.checked)} />
								<Hourglass className="h-3.5 w-3.5 text-violet-soft" />
								<span className="text-xs font-medium">{L("شروع دوره پس از اولین اتصال (start after use)", "Start the period after first use")}</span>
							</label>
							<p className="text-[11px] text-muted">
								{delayed
									? L("تایمر کاربر از لحظهٔ اولین اتصال شروع می‌شود و " + Number(form.days) + " روز اعتبار دارد؛ تا آن زمان تاریخ انقضا خالی می‌ماند.", "The timer starts at the first connection and then runs for " + Number(form.days) + " day(s); until then the expiry stays empty.")
									: L("پیش‌فرض: تایمر از همین الان شروع می‌شود.", "Default: the timer starts right now.")}
							</p>
							{delayed && Number(form.days) <= 0 && <p className="text-[11px] text-warning">{L("برای این حالت تعداد روز باید بزرگ‌تر از صفر باشد.", "This option needs a day count greater than zero.")}</p>}
						</div>
					)}

					<div className="grid grid-cols-2 gap-3">
						<Field label={t("cl_ip_limit")}><Input type="number" min={0} value={form.ipLimit} onChange={(e) => set("ipLimit", Number(e.target.value))} /></Field>
						<Field label={t("cl_phone")}><Input className="mono text-start" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0912…" /></Field>
					</div>
					<Field label={t("cl_telegram")}><Input className="mono text-start" value={form.telegramId} onChange={(e) => set("telegramId", e.target.value)} placeholder="@username" /></Field>
					<Field label={t("cl_note")}><Textarea value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
				</div>

				<div className="space-y-2">
					<div className="label flex items-center gap-1.5">
						<Layers className="h-3.5 w-3.5 text-violet-soft" />
						{L("سرویس", "Service")}
					</div>

					{creating ? (
						<>
							<p className="text-[11px] text-muted">{L("فقط سرویس را انتخاب کنید؛ سرور و اینباند به‌صورت خودکار از تعریف سرویس برداشته می‌شود.", "Just pick a service - servers and inbounds are taken from the service definition automatically.")}</p>
							{noServices ? (
								<div className="tile space-y-2">
									<p className="text-xs text-warning">{L("هنوز هیچ سرویسی تعریف نشده است؛ تا زمانی که سرویس ساخته نشود امکان ساخت کلاینت نیست.", "No service has been defined yet - clients can't be created until one exists.")}</p>
									{isOwner && (
										<Link href="/services" className="inline-flex items-center gap-1 text-[11px] text-violet-soft hover:underline">
											<Settings2 className="h-3.5 w-3.5" />
											{L("ساخت سرویس", "Create a service")}
										</Link>
									)}
								</div>
							) : (
								<div className="scrollbar-thin max-h-80 space-y-2 overflow-y-auto pe-1">
									{services.map((svc) => {
										const on = form.serviceId === svc.id
										return (
											<button key={svc.id} type="button" onClick={() => set("serviceId", svc.id)} className={cx("pick", on && "pick-on")}>
												<div className="flex items-center justify-between gap-2">
													<span className="flex min-w-0 items-center gap-2 text-sm font-medium">
														<span className={cx("h-3.5 w-3.5 shrink-0 rounded-full border-2", on ? "border-violet-soft bg-violet" : "border-line")} />
														<span className="truncate">{svc.name}</span>
													</span>
													{on && <Badge tone="violet">{L("انتخاب‌شده", "Selected")}</Badge>}
												</div>
												{svc.description && <p className="mt-1 text-[11px] text-muted">{svc.description}</p>}
											</button>
										)
									})}
								</div>
							)}
							{selected && <p className="text-[11px] text-muted">{L(configs + " کانفیگ برای این کلاینت ساخته می‌شود.", configs + " config(s) will be created for this client.")}</p>}
							{isOwner && !noServices && (
								<Link href="/services" className="inline-flex items-center gap-1 text-[11px] text-violet-soft hover:underline">
									<Settings2 className="h-3.5 w-3.5" />
									{L("مدیریت سرویس‌ها", "Manage services")}
								</Link>
							)}
						</>
					) : (
						client && (
							<div className="tile space-y-1.5">
								<div className="flex items-center justify-between gap-2">
									<span className="truncate text-sm font-medium">{selected?.name ?? L("سرویس سفارشی", "Custom service")}</span>
									<Badge tone="muted">{client.servers.length} {L("کانفیگ", "configs")}</Badge>
								</div>
								<p className="text-[11px] text-muted">{L("سرویس یک کلاینت بعد از ساخت تغییر نمی‌کند؛ برای سرویس دیگر کلاینت جدید بسازید.", "A client's service can't be changed after creation - create a new client for a different service.")}</p>
							</div>
						)
					)}
				</div>
			</form>
		</Modal>
	)
}
