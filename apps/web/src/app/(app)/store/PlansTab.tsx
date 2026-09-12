"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowUpDown, Copy, Eye, EyeOff, Layers, Package, Pencil, Plus, RefreshCw, Search, Server, ShoppingBag, Trash2, Wallet as WalletIcon } from "lucide-react"
import { api } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Empty, Input, Select, Spinner, cx, useConfirm, useToast } from "@/components/ui"
import { PlanForm } from "./PlanForm"
import { MiniStat } from "./parts"
import { emptyPlanDraft, planDraft, tr, type Plan, type PlanDraft, type ServiceOption } from "./types"

type SortKey = "order" | "price_desc" | "price_asc" | "sold" | "name"

export function PlansTab({ isOwner }: { isOwner: boolean }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const confirm = useConfirm()
	const [plans, setPlans] = useState<Plan[] | null>(null)
	const [services, setServices] = useState<ServiceOption[]>([])
	const [loadingServices, setLoadingServices] = useState(true)
	const [open, setOpen] = useState(false)
	const [editing, setEditing] = useState<string | null>(null)
	const [draft, setDraft] = useState<PlanDraft>(emptyPlanDraft())
	const [q, setQ] = useState("")
	const [only, setOnly] = useState<"all" | "active" | "inactive">("all")
	const [sort, setSort] = useState<SortKey>("order")

	const load = useCallback(async () => {
		const [p, s] = await Promise.all([api<{ plans: Plan[] }>("/api/plans"), api<{ services: ServiceOption[] }>("/api/services")])
		setPlans(p.plans)
		setServices(s.services)
		setLoadingServices(false)
	}, [])
	useEffect(() => {
		load().catch((err) => toast.err(err instanceof Error ? err.message : t("error_generic")))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [load])

	const shown = useMemo(() => {
		const needle = q.trim().toLowerCase()
		const list = (plans ?? []).filter((p) => {
			if (only === "active" && !p.isActive) return false
			if (only === "inactive" && p.isActive) return false
			if (!needle) return true
			return [p.name, p.description ?? "", p.badge ?? "", p.serviceName ?? "", p.admin?.username ?? ""].join(" ").toLowerCase().includes(needle)
		})
		const cmp: Record<SortKey, (a: Plan, b: Plan) => number> = {
			order: (a, b) => a.sortOrder - b.sortOrder || a.price - b.price,
			price_desc: (a, b) => b.price - a.price,
			price_asc: (a, b) => a.price - b.price,
			sold: (a, b) => b.sold - a.sold,
			name: (a, b) => a.name.localeCompare(b.name),
		}
		return [...list].sort(cmp[sort])
	}, [plans, q, only, sort])

	const totals = useMemo(() => {
		const all = plans ?? []
		return {
			count: all.length,
			active: all.filter((p) => p.isActive).length,
			sold: all.reduce((n, p) => n + p.sold, 0),
			revenue: all.reduce((n, p) => n + p.sold * p.price, 0),
		}
	}, [plans])

	const startNew = () => {
		setEditing(null)
		setDraft({ ...emptyPlanDraft(), serviceId: services.length === 1 ? services[0].id : null })
		setOpen(true)
	}
	const startEdit = (p: Plan) => {
		setEditing(p.id)
		setDraft(planDraft(p))
		setOpen(true)
	}
	const startCopy = (p: Plan) => {
		setEditing(null)
		setDraft({ ...planDraft(p), name: `${p.name} ${L("(کپی)", "(copy)")}`, isActive: false })
		setOpen(true)
	}

	async function remove(p: Plan) {
		if (!confirm(t("confirm_delete"))) return
		try {
			await api(`/api/plans/${p.id}`, { method: "DELETE" })
			await load()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		}
	}
	async function toggleActive(p: Plan) {
		try {
			await api(`/api/plans/${p.id}`, { method: "PATCH", json: { isActive: !p.isActive } })
			await load()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		}
	}

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<MiniStat icon={<Package className="h-4 w-4" />} label={L("همه پلن‌ها", "All plans")} value={formatNumber(totals.count, locale)} />
				<MiniStat icon={<Eye className="h-4 w-4" />} label={t("plan_active_count")} value={formatNumber(totals.active, locale)} />
				<MiniStat icon={<ShoppingBag className="h-4 w-4" />} label={t("plan_sold")} value={formatNumber(totals.sold, locale)} />
				<MiniStat icon={<WalletIcon className="h-4 w-4" />} label={L("درآمد ناخالص پلن‌ها", "Gross from plans")} value={`${formatNumber(totals.revenue, locale)} ${t("currency_irt")}`} />
			</div>

			<div className="glass flex flex-wrap items-center gap-2 p-3">
				<div className="relative min-w-[12rem] flex-1">
					<Search className="pointer-events-none absolute top-1/2 end-3 h-4 w-4 -translate-y-1/2 text-muted" />
					<Input className="pe-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("جستجوی پلن یا سرویس…", "Search plans or service…")} />
				</div>
				<div className="flex flex-wrap gap-1.5">
					{(["all", "active", "inactive"] as const).map((k) => (
						<button type="button" key={k} onClick={() => setOnly(k)} className={cx("chip", only === k && "chip-on")}>
							{k === "all" ? L("همه", "All") : k === "active" ? t("active") : t("inactive")}
						</button>
					))}
				</div>
				<div className="flex items-center gap-2">
					<ArrowUpDown className="h-4 w-4 shrink-0 text-muted" />
					<Select className="w-auto min-w-[9rem]" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
						<option value="order">{t("plan_sort")}</option>
						<option value="price_desc">{`${t("plan_price")} ↓`}</option>
						<option value="price_asc">{`${t("plan_price")} ↑`}</option>
						<option value="sold">{t("plan_sold")}</option>
						<option value="name">{t("plan_name")}</option>
					</Select>
				</div>
				<Button type="button" size="sm" variant="ghost" onClick={() => load().catch(() => undefined)}><RefreshCw className="h-4 w-4" /></Button>
				<Button type="button" variant="primary" onClick={startNew}><Plus className="h-4 w-4" /> {t("plan_new")}</Button>
			</div>
			<p className="text-xs text-muted">{L("هر پلن یک سرویس می‌فروشد؛ اینباندها همیشه از همان سرویس خوانده می‌شوند.", "Every plan sells a service; inbounds always come from that service.")}</p>

			{!plans ? (
				<div className="flex justify-center p-10"><Spinner /></div>
			) : plans.length === 0 ? (
				<Empty text={t("plan_empty")} action={<Button type="button" variant="primary" onClick={startNew}><Plus className="h-4 w-4" /> {t("plan_new")}</Button>} />
			) : shown.length === 0 ? (
				<Empty text={L("نتیجه‌ای یافت نشد", "No results")} />
			) : (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{shown.map((p) => {
						const planOff = p.oldPrice && p.oldPrice > p.price ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100) : 0
						const configs = new Set(p.targets.map((x) => x.serverId)).size
						return (
							<div key={p.id} className={cx("glass relative flex flex-col gap-3 p-5 transition hover:-translate-y-0.5", !p.isActive && "opacity-60")}>
								{p.badge && <span className="badge neon-ring absolute -top-2 start-4 bg-violet/30 text-fg">{p.badge}</span>}
								{planOff > 0 && <span className="badge badge-danger absolute -top-2 end-4">{planOff}%-</span>}
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<div className="truncate font-semibold">{p.name}</div>
										{isOwner && p.admin && <div className="text-xs text-muted">@{p.admin.username}</div>}
									</div>
									<Badge tone={p.isActive ? "success" : "muted"}>{p.isActive ? t("active") : t("inactive")}</Badge>
								</div>
								<div className="flex items-baseline gap-2">
									<span className="num neon-text text-2xl font-bold">{formatNumber(p.price, locale)}</span>
									<span className="text-xs text-muted">{t("currency_irt")}</span>
									{p.oldPrice ? <span className="num text-xs text-muted line-through">{formatNumber(p.oldPrice, locale)}</span> : null}
								</div>
								<div className="grid grid-cols-3 gap-2 text-center text-xs">
									<div className="tile"><div className="num font-semibold">{p.trafficGB || "∞"}</div><div className="text-muted">GB</div></div>
									<div className="tile"><div className="num font-semibold">{p.days || "∞"}</div><div className="text-muted">{t("plan_days")}</div></div>
									<div className="tile"><div className="num font-semibold">{p.ipLimit || "∞"}</div><div className="text-muted">{t("plan_ip")}</div></div>
								</div>
								{p.description && <p className="text-xs text-muted">{p.description}</p>}
								<div className="flex flex-wrap items-center gap-1.5 text-xs">
									{p.serviceName ? (
										<Badge tone={p.serviceActive === false ? "warning" : "cyan"}>
											<Layers className="me-1 inline h-3 w-3" />
											{p.serviceName}
										</Badge>
									) : (
										<Badge tone="warning"><AlertTriangle className="me-1 inline h-3 w-3" />{L("اینباند دستی (قدیمی)", "Manual inbounds (legacy)")}</Badge>
									)}
									{p.serviceActive === false ? <Badge tone="danger">{L("سرویس غیرفعال", "Service off")}</Badge> : null}
								</div>
								<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
									<span>{t("plan_sold")}: <b className="num text-fg">{formatNumber(p.sold, locale)}</b></span>
									<span className="inline-flex items-center gap-1"><Server className="h-3.5 w-3.5" />{formatNumber(configs, locale)} · {t("plan_targets")}: <b className="num text-fg">{formatNumber(p.targets.length, locale)}</b></span>
									{p.cost > 0 && <span title={t("wal_cost_hint")}>{t("wal_cost")}: <b className="num text-fg">{formatNumber(p.cost, locale)}</b></span>}
								</div>
								<div className="mt-auto flex gap-2">
									<Button type="button" size="sm" className="flex-1" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /> {t("edit")}</Button>
									<Button type="button" size="sm" variant="ghost" title={L("کپی پلن", "Duplicate")} onClick={() => startCopy(p)}><Copy className="h-4 w-4" /></Button>
									<Button type="button" size="sm" variant="ghost" title={p.isActive ? t("disabled") : t("enabled")} onClick={() => toggleActive(p)}>{p.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
									<Button type="button" size="sm" variant="danger" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></Button>
								</div>
							</div>
						)
					})}
				</div>
			)}

			<PlanForm
				open={open}
				editing={editing}
				value={draft}
				services={services}
				loading={loadingServices}
				onChange={setDraft}
				onClose={() => setOpen(false)}
				onSaved={async () => {
					setOpen(false)
					await load()
				}}
			/>
		</div>
	)
}
