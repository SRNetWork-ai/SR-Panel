"use client"

import { useMemo, useState, type FormEvent } from "react"
import { AlertTriangle, Check, Layers, Search, Server, Sparkles } from "lucide-react"
import { api } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Empty, Field, Input, Modal, Spinner, SubHead, Switch, Textarea, cx, useToast } from "@/components/ui"
import { DAY_PRESETS, TRAFFIC_PRESETS, tr, type PlanDraft, type ServiceOption } from "./types"

/**
 * Plan editor. A plan now sells a **service** (owner-defined inbound bundle);
 * inbounds are resolved — and re-resolved on every order — from that service.
 * Legacy plans that still carry hand-picked inbounds keep working and can be
 * migrated by picking a service here.
 */
export function PlanForm({
	open,
	editing,
	value,
	services,
	loading,
	onChange,
	onClose,
	onSaved,
}: {
	open: boolean
	editing: string | null
	value: PlanDraft
	services: ServiceOption[]
	loading: boolean
	onChange: (next: PlanDraft) => void
	onClose: () => void
	onSaved: () => Promise<void> | void
}) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [saving, setSaving] = useState(false)
	const [q, setQ] = useState("")
	const set = <K extends keyof PlanDraft>(k: K, v: PlanDraft[K]) => onChange({ ...value, [k]: v })

	const shown = useMemo(() => {
		const needle = q.trim().toLowerCase()
		if (!needle) return services
		return services.filter((s) => [s.name, s.description ?? ""].join(" ").toLowerCase().includes(needle))
	}, [services, q])

	const chosen = services.find((s) => s.id === value.serviceId) ?? null
	const legacy = !value.serviceId && value.targets.length > 0
	const inbounds = chosen ? chosen.targets.length : value.targets.length
	const configs = chosen ? new Set(chosen.targets.map((x) => x.serverId)).size : new Set(value.targets.map((x) => x.serverId)).size
	const off = value.oldPrice && value.oldPrice > value.price ? Math.round(((value.oldPrice - value.price) / value.oldPrice) * 100) : 0
	const missing = !value.serviceId && !value.targets.length

	async function save(e: FormEvent) {
		e.preventDefault()
		if (missing) {
			toast.err(L("یک سرویس برای پلن انتخاب کنید", "Pick a service for this plan"))
			return
		}
		setSaving(true)
		try {
			const body: Record<string, unknown> = {
				name: value.name,
				description: value.description || null,
				badge: value.badge || null,
				trafficGB: value.trafficGB,
				days: value.days,
				ipLimit: value.ipLimit,
				price: value.price,
				oldPrice: value.oldPrice || null,
				isActive: value.isActive,
				sortOrder: value.sortOrder,
				serviceId: value.serviceId || null,
			}
			// a legacy plan keeps its hand-picked inbounds until a service is chosen
			if (!value.serviceId) body.targets = value.targets.map((x) => ({ serverId: x.serverId, inboundId: x.inboundId }))
			if (editing) await api(`/api/plans/${editing}`, { method: "PATCH", json: body })
			else await api("/api/plans", { method: "POST", json: body })
			toast.ok(t("set_saved"))
			await onSaved()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
	}

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={editing ? t("plan_edit") : t("plan_new")}
			subtitle={chosen ? `${L("سرویس", "Service")}: ${chosen.name} · ${L("کانفیگ", "configs")}: ${formatNumber(configs, locale)}` : L("ابتدا سرویس را انتخاب کنید", "Start by picking a service")}
			size="xl"
			footer={
				<>
					<span className="me-auto text-[11px] text-warning">{missing ? L("یک سرویس انتخاب کنید", "Pick a service") : ""}</span>
					<Button type="button" onClick={onClose}>{t("cancel")}</Button>
					<Button type="submit" form="plan-form" variant="primary" loading={saving}>{t("save")}</Button>
				</>
			}
		>
			<form id="plan-form" onSubmit={save} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
				<div className="min-w-0 space-y-5">
					<section>
						<SubHead title={L("مشخصات", "Details")} hint={t("plan_badge_hint")} />
						<div className="grid gap-3 md:grid-cols-2">
							<Field label={t("plan_name")}><Input required value={value.name} onChange={(e) => set("name", e.target.value)} /></Field>
							<Field label={t("plan_badge")}><Input value={value.badge} onChange={(e) => set("badge", e.target.value)} /></Field>
							<div className="md:col-span-2">
								<Field label={t("plan_desc")}><Textarea rows={2} value={value.description} onChange={(e) => set("description", e.target.value)} /></Field>
							</div>
						</div>
					</section>

					<section>
						<SubHead
							title={<span className="inline-flex items-center gap-2"><Layers className="h-4 w-4" /> {L("سرویس پلن", "Plan service")}</span>}
							hint={L("هنگام هر سفارش، اینباندهای همین سرویس دوباره خوانده می‌شوند؛ پس تغییر سرویس روی فروش‌های بعدی اعمال می‌شود.", "Inbounds are re-resolved from this service on every order.")}
							actions={services.length > 6 ? (
								<div className="relative w-44">
									<Search className="pointer-events-none absolute top-1/2 end-3 h-4 w-4 -translate-y-1/2 text-muted" />
									<Input className="pe-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("جستجوی سرویس…", "Search services…")} />
								</div>
							) : undefined}
						/>
						{loading ? (
							<div className="flex justify-center p-6"><Spinner /></div>
						) : !services.length ? (
							<Empty text={L("هنوز سرویسی ساخته نشده است — از منوی «سرویس‌ها» یک سرویس بسازید", "No services yet — create one from the Services page")} />
						) : (
							<div className="grid gap-2 md:grid-cols-2">
								{shown.map((s) => {
									const on = value.serviceId === s.id
									const servers = new Set(s.targets.map((x) => x.serverId)).size
									const dead = s.targets.filter((x) => !x.enabled).length
									return (
										<button type="button" key={s.id} onClick={() => onChange({ ...value, serviceId: s.id, targets: [] })} className={cx("pick text-start", on && "chip-on")}>
											<div className="flex items-start justify-between gap-2">
												<div className="min-w-0">
													<div className="flex items-center gap-1.5 truncate text-sm font-semibold">
														{on ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
														{s.name}
													</div>
													{s.description ? <div className="truncate text-[11px] text-muted">{s.description}</div> : null}
												</div>
												{!s.isActive ? <Badge tone="muted">{t("inactive")}</Badge> : null}
											</div>
											<div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
												<span className="inline-flex items-center gap-1"><Server className="h-3 w-3" />{formatNumber(servers, locale)} {L("سرور", "servers")}</span>
												<span>·</span>
												<span>{formatNumber(s.targets.length, locale)} {L("اینباند", "inbounds")}</span>
												{dead > 0 ? <Badge tone="warning">{formatNumber(dead, locale)} {L("خاموش", "disabled")}</Badge> : null}
											</div>
										</button>
									)
								})}
								{!shown.length ? <div className="md:col-span-2"><Empty text={L("نتیجه‌ای یافت نشد", "No results")} /></div> : null}
							</div>
						)}
						{legacy ? (
							<div className="tile mt-2 flex flex-wrap items-center gap-2 text-[11px]">
								<AlertTriangle className="h-4 w-4 text-warning" />
								<span>{L(`این پلن قدیمی است و مستقیم به ${formatNumber(value.targets.length, locale)} اینباند وصل شده است.`, `Legacy plan bound to ${value.targets.length} inbounds.`)}</span>
								<span className="text-muted">{L("با انتخاب سرویس، جایگزین می‌شود.", "Picking a service replaces them.")}</span>
							</div>
						) : null}
					</section>

					<section>
						<SubHead title={L("محدودیت‌ها", "Limits")} hint={L("عدد صفر یعنی بی‌نهایت", "Zero means unlimited")} />
						<div className="grid gap-3 md:grid-cols-3">
							<Field label={`${t("plan_traffic")} (GB)`}><Input type="number" min={0} value={value.trafficGB} onChange={(e) => set("trafficGB", Number(e.target.value))} /></Field>
							<Field label={t("plan_days")}><Input type="number" min={0} value={value.days} onChange={(e) => set("days", Number(e.target.value))} /></Field>
							<Field label={t("plan_ip")}><Input type="number" min={0} value={value.ipLimit} onChange={(e) => set("ipLimit", Number(e.target.value))} /></Field>
						</div>
						<div className="mt-2 space-y-2">
							<div className="flex flex-wrap items-center gap-1.5">
								<span className="text-[11px] text-muted">{t("plan_traffic")}</span>
								{TRAFFIC_PRESETS.map((g) => (
									<button type="button" key={g} onClick={() => set("trafficGB", g)} className={cx("chip", value.trafficGB === g && "chip-on")}>{g === 0 ? "∞" : `${g}G`}</button>
								))}
							</div>
							<div className="flex flex-wrap items-center gap-1.5">
								<span className="text-[11px] text-muted">{t("plan_days")}</span>
								{DAY_PRESETS.map((d) => (
									<button type="button" key={d} onClick={() => set("days", d)} className={cx("chip", value.days === d && "chip-on")}>{d === 0 ? "∞" : d}</button>
								))}
							</div>
						</div>
					</section>

					<section>
						<SubHead title={t("plan_price")} hint={t("plan_old_price_hint")} actions={off > 0 ? <Badge tone="danger">{off}%-</Badge> : undefined} />
						<div className="grid gap-3 md:grid-cols-3">
							<Field label={`${t("plan_price")} (${t("currency_irt")})`}><Input type="number" min={0} required value={value.price} onChange={(e) => set("price", Number(e.target.value))} /></Field>
							<Field label={t("plan_old_price")}><Input type="number" min={0} value={value.oldPrice ?? ""} onChange={(e) => set("oldPrice", e.target.value ? Number(e.target.value) : null)} /></Field>
							<Field label={t("plan_sort")}><Input type="number" value={value.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} /></Field>
						</div>
					</section>
				</div>

				<aside className="space-y-3 lg:sticky lg:top-0 lg:self-start">
					<SubHead title={<span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4" /> {L("پیش‌نمایش", "Preview")}</span>} />
					<div className="glass glass-2 relative flex flex-col gap-3 p-4">
						{value.badge ? <span className="badge neon-ring absolute -top-2 start-4 bg-violet/30 text-fg">{value.badge}</span> : null}
						<div className="truncate pt-1 font-semibold">{value.name || L("نام پلن", "Plan name")}</div>
						<div className="flex items-baseline gap-2">
							<span className="num neon-text text-xl font-bold">{formatNumber(value.price || 0, locale)}</span>
							<span className="text-[11px] text-muted">{t("currency_irt")}</span>
							{value.oldPrice ? <span className="num text-[11px] text-muted line-through">{formatNumber(value.oldPrice, locale)}</span> : null}
						</div>
						<div className="grid grid-cols-3 gap-2 text-center text-[11px]">
							<div className="tile"><div className="num font-semibold">{value.trafficGB || "∞"}</div><div className="text-muted">GB</div></div>
							<div className="tile"><div className="num font-semibold">{value.days || "∞"}</div><div className="text-muted">{t("plan_days")}</div></div>
							<div className="tile"><div className="num font-semibold">{value.ipLimit || "∞"}</div><div className="text-muted">{t("plan_ip")}</div></div>
						</div>
						{value.description ? <p className="text-[11px] text-muted">{value.description}</p> : null}
						<div className="flex flex-wrap gap-1.5">
							<Badge tone={chosen ? "cyan" : "warning"}>{chosen ? chosen.name : L("بدون سرویس", "No service")}</Badge>
							<Badge tone="violet">{L("کانفیگ", "Configs")}: {formatNumber(configs, locale)}</Badge>
							<Badge tone="muted">{t("plan_targets")}: {formatNumber(inbounds, locale)}</Badge>
							<Badge tone={value.isActive ? "success" : "muted"}>{value.isActive ? t("active") : t("inactive")}</Badge>
						</div>
					</div>
					<div className="tile"><Switch checked={value.isActive} onChange={(v) => set("isActive", v)} label={t("plan_visible")} /></div>
					{chosen ? (
						<div className="tile space-y-1 text-[11px] text-muted">
							<div className="font-semibold text-fg">{L("مقاصد سرویس", "Service targets")}</div>
							{chosen.targets.slice(0, 8).map((x) => (
								<div key={`${x.serverId}-${x.inboundId}`} className="flex items-center justify-between gap-2">
									<span className="truncate">{x.serverName}</span>
									<span className={cx("mono shrink-0", !x.enabled && "text-warning")}>{x.inboundLabel}</span>
								</div>
							))}
							{chosen.targets.length > 8 ? <div>+{formatNumber(chosen.targets.length - 8, locale)}…</div> : null}
						</div>
					) : null}
				</aside>
			</form>
		</Modal>
	)
}
