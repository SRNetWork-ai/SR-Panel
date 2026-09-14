"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Hourglass, Layers, Settings2, Wallet } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import type { ClientDto, ServiceDto } from "@/lib/dto"
import { formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Field, Input, Modal, Textarea, cx, useToast } from "@/components/ui"

export type ClientKind = "LIMITED" | "UNLIMITED"
export type ServiceKind = "BOTH" | "LIMITED" | "UNLIMITED"
/** Mirror of ClientTypeAccess in @srpanel/core — a client file must not import server code. */
export type ClientTypeAccess = { limited: boolean; unlimited: boolean; services: Record<string, ServiceKind> }

/** The services the owner offers for this client type. */
export const servicesForKind = (services: ServiceDto[], access: ClientTypeAccess, kind: ClientKind): ServiceDto[] =>
	services.filter((s) => {
		const k = access.services[s.id] ?? "BOTH"
		return k === "BOTH" || k === kind
	})

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

/** GET /api/wallet/quote — WalletQuote from @srpanel/core after JSON serialisation. */
type Quote = {
	billingEnabled: boolean
	perGB: number
	perDay: number
	cost: number
	balance: number
	after: number
	limits: { remaining: number | null; clientsRemaining: number | null } | null
	blockers: string[]
}

/** Mirrors configLabel() in @srpanel/core so the operator sees the real x-ui name. */
function labelPreview(name: string, tag: string): string {
	const n = name.trim()
	const g = tag.trim()
	if (!g) return n
	return /[-_.|:/\u2022]$/.test(g) ? `${g}${n}` : `${g}-${n}`
}

/**
 * «client limited» / «client unlimited».
 * The type comes from the button the operator pressed: an unlimited client is
 * just a client with trafficGB = 0, so the traffic input disappears and the
 * wallet quote is asked with `unlimited=1`.
 */
export function CreateClient({ kind, services, isOwner, onClose, onSaved }: { kind: ClientKind; services: ServiceDto[]; isOwner: boolean; onClose: () => void; onSaved: (client: ClientDto, created: boolean) => void }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const toast = useToast()
	const limited = kind === "LIMITED"
	const [form, setForm] = useState<Form>({ name: "", tag: "", serviceId: services[0]?.id ?? "", trafficGB: limited ? 50 : 0, days: 30, startAfterUse: false, ipLimit: 0, note: "", phone: "", telegramId: "" })
	const [busy, setBusy] = useState(false)
	const [quote, setQuote] = useState<Quote | null>(null)
	const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

	const selected = useMemo(() => services.find((s) => s.id === form.serviceId) ?? null, [services, form.serviceId])
	const configs = useMemo(() => (selected ? new Set(selected.targets.map((x) => x.serverId)).size : 0), [selected])
	const noServices = services.length === 0
	const gb = limited ? Math.max(0, Number(form.trafficGB) || 0) : 0
	const delayed = form.startAfterUse
	const incomplete = noServices || !form.serviceId || (delayed && Number(form.days) <= 0) || (limited && gb <= 0)
	const blocked = !isOwner && !!quote && quote.blockers.length > 0

	/** Live receipt for resellers: price, wallet balance after and quota headroom. */
	useEffect(() => {
		if (isOwner) return
		const qs = new URLSearchParams({ gb: String(gb), days: String(Math.max(0, Number(form.days) || 0)), quotaGb: String(gb) })
		if (!limited) qs.set("unlimited", "1")
		const id = setTimeout(() => {
			api<Quote>(`/api/wallet/quote?${qs.toString()}`)
				.then(setQuote)
				.catch(() => undefined)
		}, 300)
		return () => clearTimeout(id)
	}, [isOwner, limited, gb, form.days])

	const submit = async (e: FormEvent) => {
		e.preventDefault()
		setBusy(true)
		try {
			const r = await api<SaveResult>("/api/clients", {
				method: "POST",
				json: {
					name: form.name.trim(),
					tag: form.tag.trim() || null,
					trafficGB: gb,
					ipLimit: Number(form.ipLimit),
					note: form.note || null,
					phone: form.phone || null,
					telegramId: form.telegramId || null,
					days: Number(form.days),
					startAfterUse: form.startAfterUse,
					serviceId: form.serviceId,
				},
			})
			if (r.errors.length) toast.err(`${t("cl_partial_error")} ${r.errors.join(" | ")}`)
			else toast.ok(t("set_saved"))
			onSaved(r.client, true)
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
			title={limited ? L("کلاینت جدید — حجمی", "New client — limited") : L("کلاینت جدید — نامحدود", "New client — unlimited")}
			wide
			footer={
				<Button variant="primary" type="submit" form="create-client" loading={busy} disabled={incomplete || blocked}>
					{t("create")}
				</Button>
			}
		>
			<form id="create-client" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<Badge tone={limited ? "violet" : "muted"}>{limited ? L("حجمی", "Limited") : L("نامحدود ∞", "Unlimited ∞")}</Badge>
						<span className="text-[11px] text-muted">{limited ? L("ترافیک مشخص، پس از اتمام قطع می‌شود", "A fixed traffic quota; cut off when it runs out") : L("بدون محدودیت ترافیک، فقط زمان‌دار", "No traffic limit, time-based only")}</span>
					</div>

					<div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
						<Field label={t("name")}><Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder={t("cl_name_ph")} /></Field>
						<Field label={L("تگ", "Tag")}><Input value={form.tag} onChange={(e) => set("tag", e.target.value)} maxLength={24} placeholder={L("مثلاً SR", "e.g. SR")} /></Field>
					</div>
					<p className="text-[11px] text-muted">
						{L("نام کانفیگ روی پنل: ", "Config name on the panel: ")}
						<span className="mono text-violet-soft" dir="ltr">{labelPreview(form.name, form.tag) || "—"}</span>
					</p>

					<div className="grid grid-cols-2 gap-3">
						{limited ? (
							<Field label={t("cl_traffic_gb")}><Input type="number" min={1} step="0.5" value={form.trafficGB} onChange={(e) => set("trafficGB", Number(e.target.value))} /></Field>
						) : (
							<Field label={t("cl_traffic_gb")}><Input value="∞" readOnly disabled className="text-center" /></Field>
						)}
						<Field label={delayed ? L("روز (از اولین اتصال)", "Days (from first use)") : t("cl_days")}><Input type="number" min={0} value={form.days} onChange={(e) => set("days", Number(e.target.value))} /></Field>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{limited && [10, 30, 50, 100, 200, 500].map((g) => <button key={g} type="button" className={cx("chip", form.trafficGB === g && "chip-on")} onClick={() => set("trafficGB", g)}>{g} GB</button>)}
						{limited && <span className="mx-1 opacity-30">|</span>}
						{[30, 60, 90, 180, 365].map((d) => <button key={d} type="button" className={cx("chip", form.days === d && "chip-on")} onClick={() => set("days", d)}>{d} {t("day_short")}</button>)}
					</div>
					{limited && gb <= 0 && <p className="text-[11px] text-warning">{L("برای کلاینت حجمی ترافیک باید بزرگ‌تر از صفر باشد؛ برای نامحدود از دکمهٔ «کلاینت نامحدود» استفاده کنید.", "A limited client needs traffic above zero; use the «unlimited client» button instead.")}</p>}

					{!isOwner && quote && (quote.billingEnabled || quote.limits) && (
						<div className={cx("tile space-y-1.5", quote.blockers.length > 0 && "ring-1 ring-danger/40")}>
							<div className="flex items-center justify-between gap-2">
								<span className="flex items-center gap-1.5 text-xs font-medium">
									<Wallet className="h-3.5 w-3.5 text-violet-soft" />
									{L("هزینه و سهمیه", "Cost & quota")}
								</span>
								{quote.billingEnabled ? (
									<span className="num text-sm font-semibold text-violet-soft">{formatNumber(quote.cost, locale)} {t("currency_irt")}</span>
								) : (
									<Badge tone="muted">{t("wal_billing_off")}</Badge>
								)}
							</div>
							{quote.billingEnabled && (
								<p className="num text-[11px] text-muted">
									{L("موجودی", "Balance")}: {formatNumber(quote.balance, locale)} → <b className={cx(quote.after < 0 ? "text-danger" : "text-success")}>{formatNumber(quote.after, locale)}</b>
									{" · "}{formatNumber(quote.perGB, locale)}/GB · {formatNumber(quote.perDay, locale)}/{t("day_short")}
								</p>
							)}
							{quote.limits && (
								<p className="num text-[11px] text-muted">
									{L("سهمیهٔ باقی‌مانده", "Quota left")}: {quote.limits.remaining === null ? "∞" : `${formatNumber(Math.max(0, Math.round(quote.limits.remaining / 1024 ** 3)), locale)} GB`}
									{" · "}{L("ظرفیت کلاینت", "Client slots")}: {quote.limits.clientsRemaining === null ? "∞" : formatNumber(quote.limits.clientsRemaining, locale)}
								</p>
							)}
							{quote.blockers.map((b) => <p key={b} className="text-[11px] text-danger">• {b}</p>)}
						</div>
					)}

					<div className={cx("tile space-y-1.5", delayed && "ring-1 ring-violet-soft/40")}>
						<label className="flex cursor-pointer items-center gap-2">
							<input type="checkbox" className="h-4 w-4" checked={form.startAfterUse} onChange={(e) => set("startAfterUse", e.target.checked)} />
							<Hourglass className="h-3.5 w-3.5 text-violet-soft" />
							<span className="text-xs font-medium">{L("شروع دوره پس از اولین اتصال", "Start the period after first use")}</span>
						</label>
						<p className="text-[11px] text-muted">
							{delayed
								? L("تایمر از اولین اتصال شروع می‌شود و " + Number(form.days) + " روز اعتبار دارد؛ تا آن زمان تاریخ انقضا خالی می‌ماند.", "The timer starts at the first connection and then runs for " + Number(form.days) + " day(s).")
								: L("پیش‌فرض: تایمر از همین الان شروع می‌شود.", "Default: the timer starts right now.")}
						</p>
						{delayed && Number(form.days) <= 0 && <p className="text-[11px] text-warning">{L("برای این حالت تعداد روز باید بزرگ‌تر از صفر باشد.", "This option needs a day count greater than zero.")}</p>}
					</div>

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
					<p className="text-[11px] text-muted">{L("فقط سرویس‌هایی نمایش داده می‌شوند که برای این نوع کلاینت ارائه شده‌اند؛ سرور و اینباند خودکار از تعریف سرویس برداشته می‌شود.", "Only services offered for this client type are listed; servers and inbounds come from the service definition.")}</p>
					{noServices ? (
						<div className="tile space-y-2">
							<p className="text-xs text-warning">{limited ? L("هیچ سرویسی برای کلاینت حجمی ارائه نشده است.", "No service is offered for limited clients.") : L("هیچ سرویسی برای کلاینت نامحدود ارائه نشده است.", "No service is offered for unlimited clients.")}</p>
							{isOwner && (
								<Link href="/client-types" className="inline-flex items-center gap-1 text-[11px] text-violet-soft hover:underline">
									<Settings2 className="h-3.5 w-3.5" />
									{L("تنظیم انواع کلاینت", "Configure client types")}
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
				</div>
			</form>
		</Modal>
	)
}
