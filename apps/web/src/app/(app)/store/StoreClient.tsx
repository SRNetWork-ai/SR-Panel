"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { ArrowUpDown, Check, Clock, Copy, CreditCard, ExternalLink, Eye, EyeOff, LayoutGrid, Link2, Package, Pencil, Percent, Plus, RefreshCw, Search, Server, Settings2, ShieldCheck, ShoppingBag, Sparkles, Ticket, Trash2, TrendingUp, Wallet as WalletIcon } from "lucide-react"
import { api, copyText } from "@/lib/client"
import { formatDate, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Stat, SubHead, Switch, Tabs, Textarea, cx, useConfirm, useToast } from "@/components/ui"

/* ---------- types (mirror API DTOs) ---------- */
type Method = "USDT" | "CARD" | "ZARINPAL"
type StoreSettings = {
	id: string
	enabled: boolean
	slug: string
	title: string | null
	description: string | null
	rules: string | null
	supportUrl: string | null
	currency: string
	usdtEnabled: boolean
	usdtAddress: string | null
	usdtNetwork: string
	usdtRate: number
	usdtAutoVerify: boolean
	cardEnabled: boolean
	cardNumber: string | null
	cardHolder: string | null
	cardBank: string | null
	zarinpalEnabled: boolean
	zarinpalSandbox: boolean
	hasZarinpal: boolean
	zarinpalMerchantMasked: string
	requireTelegram: boolean
	requirePhone: boolean
	paymentTtlMin: number
	url: string
	methods: Method[]
}
type Target = { serverId: string; inboundId: number }
type Plan = {
	id: string
	name: string
	description: string | null
	badge: string | null
	trafficGB: number
	days: number
	ipLimit: number
	price: number
	oldPrice: number | null
	targets: Target[]
	isActive: boolean
	sortOrder: number
	sold: number
	cost: number
	admin?: { username: string }
}
type Discount = { id: string; code: string; percent: number; amount: number; maxUses: number | null; uses: number; expiresAt: string | null; isActive: boolean }
type ServerDto = { id: string; name: string; inbounds: Array<{ id: number; remark?: string; protocol?: string; port?: number }> }
type Overview = {
	enabled: boolean
	slug: string | null
	url: string | null
	methods: Method[]
	counts: Record<string, number>
	revenue30d: number
	pendingReview: number
	activePlans: number
	recent: Array<{ id: string; status: string; amount: number; customerName: string | null; customerTelegramId: string | null; createdAt: string; plan: { name: string } | null }>
}
type Tab = "overview" | "plans" | "discounts" | "settings"

const ORDER_TONE: Record<string, "success" | "warning" | "danger" | "muted" | "violet" | "cyan"> = { PENDING: "warning", PAID: "cyan", FULFILLED: "success", CANCELED: "muted", EXPIRED: "danger" }
const ORDER_STATUSES = ["PENDING", "PAID", "FULFILLED", "CANCELED", "EXPIRED"]
const TRAFFIC_PRESETS = [10, 30, 50, 100, 200, 500, 0]
const DAY_PRESETS = [7, 30, 60, 90, 180, 365, 0]

/** tiny bilingual helper: avoids inventing new dictionary keys for the new labels */
const tr = (locale: string, fa: string, en: string) => (locale === "en" ? en : fa)

/* ---------- shared bits ---------- */
function CopyBtn({ value, label }: { value: string; label?: string }) {
	const [ok, setOk] = useState(false)
	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
			onClick={async () => {
				if (await copyText(value)) {
					setOk(true)
					setTimeout(() => setOk(false), 1400)
				}
			}}
		>
			{ok ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
			{label}
		</Button>
	)
}

function MiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
	return (
		<div className="tile flex items-center gap-3">
			<span className="text-violet-soft">{icon}</span>
			<div className="min-w-0">
				<div className="text-[11px] text-muted">{label}</div>
				<div className="num truncate text-sm font-semibold">{value}</div>
			</div>
		</div>
	)
}

/* ---------- overview ---------- */
function OverviewTab({ onGoto }: { onGoto: (tab: Tab) => void }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const [data, setData] = useState<Overview | null>(null)
	const [busy, setBusy] = useState(false)
	const load = useCallback(async () => setData(await api<Overview>("/api/store/overview")), [])
	useEffect(() => {
		load().catch(() => undefined)
	}, [load])
	if (!data) return <div className="flex justify-center p-10"><Spinner /></div>
	const total = Object.values(data.counts).reduce((a, b) => a + b, 0)
	return (
		<div className="space-y-5">
			{!data.enabled && (
				<div className="glass flex flex-wrap items-center justify-between gap-3 border border-warning/30 p-4">
					<div className="text-sm">{t("store_disabled_hint")}</div>
					<Button type="button" onClick={() => onGoto("settings")}><Settings2 className="h-4 w-4" /> {t("store_tab_settings")}</Button>
				</div>
			)}
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<Stat label={t("store_revenue_30d")} value={<span className="num">{formatNumber(data.revenue30d, locale)}</span>} sub={t("currency_irt")} icon={<WalletIcon className="h-5 w-5" />} />
				<Stat label={t("store_orders_30d")} value={<span className="num">{formatNumber(total, locale)}</span>} sub={`${formatNumber(data.counts.FULFILLED ?? 0, locale)} ${t("ord_st_FULFILLED")}`} icon={<ShoppingBag className="h-5 w-5" />} accent="cyan" />
				<Stat label={t("pay_pending_review")} value={<span className="num">{formatNumber(data.pendingReview, locale)}</span>} icon={<CreditCard className="h-5 w-5" />} accent={data.pendingReview ? "warning" : "violet"} />
				<Stat label={t("plan_active_count")} value={<span className="num">{formatNumber(data.activePlans, locale)}</span>} icon={<Package className="h-5 w-5" />} accent="success" />
			</div>
			<div className="grid gap-4 lg:grid-cols-5">
				<Card title={<span className="inline-flex items-center gap-2"><Link2 className="h-4 w-4" /> {t("store_link")}</span>} className="lg:col-span-2">
					{data.url ? (
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<input readOnly value={data.url} className="input mono flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
								<CopyBtn value={data.url} />
								<a className="btn btn-ghost btn-sm" href={data.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
							</div>
							<div className="flex flex-wrap gap-1.5">
								{data.methods.length ? data.methods.map((m) => <Badge key={m} tone="cyan">{t(`pay_m_${m}` as never)}</Badge>) : <Badge tone="warning">{t("store_no_methods")}</Badge>}
							</div>
							<p className="text-xs text-muted">{t("store_tg_hint")} <code className="kbd">/start store_{data.slug}</code></p>
							<div className="flex flex-wrap gap-2 pt-1">
								<Button type="button" size="sm" variant="ghost" onClick={() => onGoto("plans")}><Package className="h-4 w-4" /> {t("store_tab_plans")}</Button>
								<Button type="button" size="sm" variant="ghost" onClick={() => onGoto("discounts")}><Percent className="h-4 w-4" /> {t("store_tab_discounts")}</Button>
								<Button type="button" size="sm" variant="ghost" onClick={() => onGoto("settings")}><Settings2 className="h-4 w-4" /> {t("store_tab_settings")}</Button>
							</div>
						</div>
					) : <Empty text={t("store_disabled_hint")} action={<Button type="button" onClick={() => onGoto("settings")}>{t("store_tab_settings")}</Button>} />}
				</Card>
				<Card title={<span className="inline-flex items-center gap-2"><TrendingUp className="h-4 w-4" /> {L("وضعیت سفارش‌ها", "Order status")}</span>} subtitle={L("۳۰ روز گذشته", "Last 30 days")} className="lg:col-span-3">
					<div className="grid gap-2 sm:grid-cols-2">
						{ORDER_STATUSES.map((k) => {
							const n = data.counts[k] ?? 0
							const pct = total ? Math.round((n / total) * 100) : 0
							return (
								<div key={k} className="tile">
									<div className="flex items-center justify-between gap-2">
										<Badge tone={ORDER_TONE[k] ?? "muted"}>{t(`ord_st_${k}` as never)}</Badge>
										<span className="num text-sm font-semibold">{formatNumber(n, locale)} <span className="text-[11px] text-muted">({pct}%)</span></span>
									</div>
									<div className="progress mt-2"><span style={{ width: `${pct}%` }} /></div>
								</div>
							)
						})}
					</div>
				</Card>
			</div>
			<Card
				title={t("ord_recent")}
				actions={
					<>
						<a className="btn btn-ghost btn-sm" href="/orders">{L("همه سفارش‌ها", "All orders")}</a>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							loading={busy}
							onClick={async () => {
								setBusy(true)
								await load().catch(() => undefined)
								setBusy(false)
							}}
						>
							<RefreshCw className="h-4 w-4" />
						</Button>
					</>
				}
			>
				{data.recent.length ? (
					<div className="table-wrap">
						<table className="table">
							<thead><tr><th>{t("plan_name")}</th><th>{t("ord_customer")}</th><th>{t("ord_amount")}</th><th>{t("status")}</th><th>{t("created_at")}</th></tr></thead>
							<tbody>
								{data.recent.map((o) => (
									<tr key={o.id}>
										<td>{o.plan?.name ?? "—"}</td>
										<td className="text-muted">{o.customerName || o.customerTelegramId || "—"}</td>
										<td className="num">{formatNumber(o.amount, locale)}</td>
										<td><Badge tone={ORDER_TONE[o.status] ?? "muted"}>{t(`ord_st_${o.status}` as never)}</Badge></td>
										<td className="text-muted">{formatDate(o.createdAt, locale, true)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : <Empty text={t("ord_empty")} />}
			</Card>
		</div>
	)
}

/* ---------- plans ---------- */
const emptyPlan = (): Omit<Plan, "id" | "sold" | "cost"> => ({ name: "", description: "", badge: "", trafficGB: 50, days: 30, ipLimit: 0, price: 0, oldPrice: null, targets: [], isActive: true, sortOrder: 0 })
type SortKey = "order" | "price_desc" | "price_asc" | "sold" | "name"

function PlansTab({ isOwner }: { isOwner: boolean }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const confirm = useConfirm()
	const [plans, setPlans] = useState<Plan[] | null>(null)
	const [servers, setServers] = useState<ServerDto[]>([])
	const [open, setOpen] = useState(false)
	const [editing, setEditing] = useState<string | null>(null)
	const [form, setForm] = useState(emptyPlan())
	const [saving, setSaving] = useState(false)
	const [q, setQ] = useState("")
	const [only, setOnly] = useState<"all" | "active" | "inactive">("all")
	const [sort, setSort] = useState<SortKey>("order")

	const load = useCallback(async () => {
		const [p, s] = await Promise.all([api<{ plans: Plan[] }>("/api/plans"), api<ServerDto[]>("/api/servers")])
		setPlans(p.plans)
		setServers(s)
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
			return [p.name, p.description ?? "", p.badge ?? "", p.admin?.username ?? ""].join(" ").toLowerCase().includes(needle)
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

	const basics = (p: Plan) => ({ name: p.name, description: p.description ?? "", badge: p.badge ?? "", trafficGB: p.trafficGB, days: p.days, ipLimit: p.ipLimit, price: p.price, oldPrice: p.oldPrice, targets: p.targets, isActive: p.isActive, sortOrder: p.sortOrder })
	const startNew = () => { setEditing(null); setForm(emptyPlan()); setOpen(true) }
	const startEdit = (p: Plan) => { setEditing(p.id); setForm(basics(p)); setOpen(true) }
	const startCopy = (p: Plan) => { setEditing(null); setForm({ ...basics(p), name: `${p.name} ${L("(کپی)", "(copy)")}`, isActive: false }); setOpen(true) }

	const toggleTarget = (serverId: string, inboundId: number) =>
		setForm((f) => ({ ...f, targets: f.targets.some((x) => x.serverId === serverId && x.inboundId === inboundId) ? f.targets.filter((x) => !(x.serverId === serverId && x.inboundId === inboundId)) : [...f.targets, { serverId, inboundId }] }))
	const setServerAll = (s: ServerDto, on: boolean) =>
		setForm((f) => ({ ...f, targets: on ? [...f.targets.filter((x) => x.serverId !== s.id), ...s.inbounds.map((ib) => ({ serverId: s.id, inboundId: ib.id }))] : f.targets.filter((x) => x.serverId !== s.id) }))
	const picked = (serverId: string) => form.targets.filter((x) => x.serverId === serverId).length
	const configCount = new Set(form.targets.map((x) => x.serverId)).size
	const off = form.oldPrice && form.oldPrice > form.price ? Math.round(((form.oldPrice - form.price) / form.oldPrice) * 100) : 0

	async function save(e: FormEvent) {
		e.preventDefault()
		setSaving(true)
		try {
			const body = { ...form, description: form.description || null, badge: form.badge || null, oldPrice: form.oldPrice || null }
			if (editing) await api(`/api/plans/${editing}`, { method: "PATCH", json: body })
			else await api("/api/plans", { method: "POST", json: body })
			toast.ok(t("set_saved"))
			setOpen(false)
			await load()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
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
				<MiniStat icon={<WalletIcon className="h-4 w-4" />} label={L("درآمد کل پلن‌ها", "Gross from plans")} value={`${formatNumber(totals.revenue, locale)} ${t("currency_irt")}`} />
			</div>

			<div className="glass flex flex-wrap items-center gap-2 p-3">
				<div className="relative min-w-[12rem] flex-1">
					<Search className="pointer-events-none absolute top-1/2 end-3 h-4 w-4 -translate-y-1/2 text-muted" />
					<Input className="pe-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("جستجوی پلن…", "Search plans…")} />
				</div>
				<div className="flex flex-wrap gap-1.5">
					{(["all", "active", "inactive"] as const).map((k) => (
						<button type="button" key={k} onClick={() => setOnly(k)} className={cx("chip", only === k && "chip-on")}>
							{k === "all" ? L("همه", "All") : k === "active" ? t("active") : t("inactive")}
						</button>
					))}
				</div>
				<div className="flex items-center gap-2">
					<ArrowUpDown className="h-4 w-4 text-muted" />
					<Select className="w-auto min-w-[10rem]" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
						<option value="order">{t("plan_sort")}</option>
						<option value="price_desc">{`${t("plan_price")} ↓`}</option>
						<option value="price_asc">{`${t("plan_price")} ↑`}</option>
						<option value="sold">{t("plan_sold")}</option>
						<option value="name">{t("plan_name")}</option>
					</Select>
				</div>
				<Button type="button" variant="ghost" size="sm" onClick={() => load().catch(() => undefined)}><RefreshCw className="h-4 w-4" /></Button>
				<Button type="button" variant="primary" onClick={startNew}><Plus className="h-4 w-4" /> {t("plan_new")}</Button>
			</div>
			<p className="text-xs text-muted">{t("plan_hint")}</p>

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
								{p.description && <p className="line-clamp-2 text-xs text-muted">{p.description}</p>}
								<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
									<span>{t("plan_sold")}: <b className="num text-fg">{formatNumber(p.sold, locale)}</b></span>
									<span className="inline-flex items-center gap-1"><Server className="h-3.5 w-3.5" /> {formatNumber(configs, locale)} · {t("plan_targets")}: <b className="num text-fg">{formatNumber(p.targets.length, locale)}</b></span>
									{p.cost > 0 && <span title={t("wal_cost_hint")}>{t("wal_cost")}: <b className="num text-fg">{formatNumber(p.cost, locale)}</b></span>}
								</div>
								<div className="mt-auto flex gap-2">
									<Button type="button" size="sm" onClick={() => startEdit(p)} className="flex-1"><Pencil className="h-4 w-4" /> {t("edit")}</Button>
									<Button type="button" size="sm" variant="ghost" title={L("کپی پلن", "Duplicate")} onClick={() => startCopy(p)}><Copy className="h-4 w-4" /></Button>
									<Button type="button" size="sm" variant="ghost" title={p.isActive ? t("disabled") : t("enabled")} onClick={() => toggleActive(p)}>{p.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
									<Button type="button" size="sm" variant="danger" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></Button>
								</div>
							</div>
						)
					})}
				</div>
			)}

			<Modal
				open={open}
				onClose={() => setOpen(false)}
				title={editing ? t("plan_edit") : t("plan_new")}
				subtitle={`${t("plan_targets")}: ${formatNumber(form.targets.length, locale)} · ${L("کانفیگ", "configs")}: ${formatNumber(configCount, locale)}`}
				size="xl"
				footer={
					<>
						<span className="me-auto text-[11px] text-muted">{form.targets.length === 0 ? L("حداقل یک اینباند انتخاب کنید", "Pick at least one inbound") : ""}</span>
						<Button type="button" onClick={() => setOpen(false)}>{t("cancel")}</Button>
						<Button type="submit" form="plan-form" variant="primary" loading={saving}>{t("save")}</Button>
					</>
				}
			>
				<form id="plan-form" onSubmit={save} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
					<div className="min-w-0 space-y-5">
						<section>
							<SubHead title={L("مشخصات", "Details")} hint={t("plan_badge_hint")} />
							<div className="grid gap-3 md:grid-cols-2">
								<Field label={t("plan_name")}><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
								<Field label={t("plan_badge")}><Input value={form.badge ?? ""} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder={L("مثلاً پرفروش", "e.g. Popular")} /></Field>
								<div className="md:col-span-2"><Field label={t("plan_desc")}><Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
							</div>
						</section>

						<section>
							<SubHead title={L("محدودیت‌ها", "Limits")} hint={L("عدد صفر یعنی بی‌نهایت", "Zero means unlimited")} />
							<div className="grid gap-3 md:grid-cols-3">
								<Field label={`${t("plan_traffic")} (GB)`}><Input type="number" min={0} value={form.trafficGB} onChange={(e) => setForm({ ...form, trafficGB: Number(e.target.value) })} /></Field>
								<Field label={t("plan_days")}><Input type="number" min={0} value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} /></Field>
								<Field label={t("plan_ip")}><Input type="number" min={0} value={form.ipLimit} onChange={(e) => setForm({ ...form, ipLimit: Number(e.target.value) })} /></Field>
							</div>
							<div className="mt-2 space-y-2">
								<div className="flex flex-wrap items-center gap-1.5">
									<span className="text-[11px] text-muted">{t("plan_traffic")}</span>
									{TRAFFIC_PRESETS.map((g) => (
										<button type="button" key={g} onClick={() => setForm({ ...form, trafficGB: g })} className={cx("chip", form.trafficGB === g && "chip-on")}>{g === 0 ? "∞" : `${g}G`}</button>
									))}
								</div>
								<div className="flex flex-wrap items-center gap-1.5">
									<span className="text-[11px] text-muted">{t("plan_days")}</span>
									{DAY_PRESETS.map((d) => (
										<button type="button" key={d} onClick={() => setForm({ ...form, days: d })} className={cx("chip", form.days === d && "chip-on")}>{d === 0 ? "∞" : d}</button>
									))}
								</div>
							</div>
						</section>

						<section>
							<SubHead title={t("plan_price")} hint={t("plan_old_price_hint")} actions={off > 0 ? <Badge tone="danger">{off}%-</Badge> : undefined} />
							<div className="grid gap-3 md:grid-cols-3">
								<Field label={`${t("plan_price")} (${t("currency_irt")})`}><Input type="number" min={0} required value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></Field>
								<Field label={t("plan_old_price")}><Input type="number" min={0} value={form.oldPrice ?? ""} onChange={(e) => setForm({ ...form, oldPrice: e.target.value ? Number(e.target.value) : null })} /></Field>
								<Field label={t("plan_sort")}><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></Field>
							</div>
						</section>

						<section>
							<SubHead
								title={<span className="inline-flex items-center gap-2"><Server className="h-4 w-4" /> {t("plan_targets")}</span>}
								hint={t("plan_targets_hint")}
								actions={form.targets.length ? <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, targets: [] })}>{L("پاک کردن همه", "Clear all")}</Button> : undefined}
							/>
							<div className="grid gap-2 md:grid-cols-2">
								{servers.map((s) => {
									const n = picked(s.id)
									return (
										<div key={s.id} className="tile">
											<div className="mb-2 flex items-center justify-between gap-2">
												<div className="truncate text-sm font-semibold">{s.name}</div>
												<div className="flex shrink-0 items-center gap-1.5">
													{n > 0 && <Badge tone="violet">{formatNumber(n, locale)}</Badge>}
													<button type="button" className="chip" disabled={!s.inbounds.length} onClick={() => setServerAll(s, n !== s.inbounds.length)}>{n === s.inbounds.length && n > 0 ? L("هیچ", "None") : L("همه", "All")}</button>
												</div>
											</div>
											<div className="flex flex-wrap gap-1.5">
												{s.inbounds.map((ib) => {
													const on = form.targets.some((x) => x.serverId === s.id && x.inboundId === ib.id)
													return (
														<button type="button" key={ib.id} onClick={() => toggleTarget(s.id, ib.id)} className={cx("chip", on && "chip-on")}>
															{on && <Check className="h-3 w-3" />}
															{ib.remark || `#${ib.id}`}{ib.protocol ? ` · ${ib.protocol}` : ""}{ib.port ? `:${ib.port}` : ""}
														</button>
													)
												})}
												{!s.inbounds.length && <span className="text-xs text-muted">{t("plan_no_inbounds")}</span>}
											</div>
										</div>
									)
								})}
								{!servers.length && <div className="md:col-span-2"><Empty text={t("plan_no_servers")} /></div>}
							</div>
							<p className="mt-2 text-[11px] text-muted">{L("از هر سرور یک کانفیگ ساخته می‌شود؛ چند اینباند از یک سرور در همان کانفیگ جمع می‌شوند.", "One config per server; several inbounds of the same server are merged into it.")}</p>
						</section>
					</div>

					<aside className="space-y-3 lg:sticky lg:top-0 lg:self-start">
						<SubHead title={<span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4" /> {L("پیش‌نمایش", "Preview")}</span>} />
						<div className="glass glass-2 relative flex flex-col gap-3 p-4">
							{form.badge ? <span className="badge neon-ring absolute -top-2 start-4 bg-violet/30 text-fg">{form.badge}</span> : null}
							<div className="truncate pt-1 font-semibold">{form.name || L("نام پلن", "Plan name")}</div>
							<div className="flex items-baseline gap-2">
								<span className="num neon-text text-xl font-bold">{formatNumber(form.price || 0, locale)}</span>
								<span className="text-[11px] text-muted">{t("currency_irt")}</span>
								{form.oldPrice ? <span className="num text-[11px] text-muted line-through">{formatNumber(form.oldPrice, locale)}</span> : null}
							</div>
							<div className="grid grid-cols-3 gap-2 text-center text-[11px]">
								<div className="tile"><div className="num font-semibold">{form.trafficGB || "∞"}</div><div className="text-muted">GB</div></div>
								<div className="tile"><div className="num font-semibold">{form.days || "∞"}</div><div className="text-muted">{t("plan_days")}</div></div>
								<div className="tile"><div className="num font-semibold">{form.ipLimit || "∞"}</div><div className="text-muted">{t("plan_ip")}</div></div>
							</div>
							{form.description ? <p className="text-[11px] text-muted">{form.description}</p> : null}
							<div className="flex flex-wrap gap-1.5 text-[11px]">
								<Badge tone="cyan">{L("کانفیگ", "Configs")}: {formatNumber(configCount, locale)}</Badge>
								<Badge tone="violet">{t("plan_targets")}: {formatNumber(form.targets.length, locale)}</Badge>
								<Badge tone={form.isActive ? "success" : "muted"}>{form.isActive ? t("active") : t("inactive")}</Badge>
							</div>
						</div>
						<div className="tile"><Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label={t("plan_visible")} /></div>
					</aside>
				</form>
			</Modal>
		</div>
	)
}

/* ---------- discounts ---------- */
function DiscountsTab() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const confirm = useConfirm()
	const [items, setItems] = useState<Discount[] | null>(null)
	const [form, setForm] = useState({ code: "", percent: 10, amount: 0, maxUses: "" as string | number, expiresAt: "" })
	const [saving, setSaving] = useState(false)
	const [q, setQ] = useState("")
	const load = useCallback(async () => setItems((await api<{ discounts: Discount[] }>("/api/discounts")).discounts), [])
	useEffect(() => {
		load().catch(() => undefined)
	}, [load])

	const shown = useMemo(() => {
		const needle = q.trim().toLowerCase()
		return (items ?? []).filter((d) => !needle || d.code.toLowerCase().includes(needle))
	}, [items, q])
	const totals = useMemo(() => {
		const all = items ?? []
		const live = all.filter((d) => d.isActive && !(d.expiresAt && new Date(d.expiresAt).getTime() < Date.now()) && !(d.maxUses != null && d.uses >= d.maxUses))
		return { count: all.length, live: live.length, uses: all.reduce((n, d) => n + d.uses, 0) }
	}, [items])

	const randomCode = () => {
		const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
		let out = ""
		for (let i = 0; i < 6; i += 1) out += abc[Math.floor(Math.random() * abc.length)]
		setForm((f) => ({ ...f, code: out }))
	}

	async function create(e: FormEvent) {
		e.preventDefault()
		setSaving(true)
		try {
			await api("/api/discounts", { method: "POST", json: { code: form.code, percent: Number(form.percent) || 0, amount: Number(form.amount) || 0, maxUses: form.maxUses === "" ? null : Number(form.maxUses), expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null } })
			setForm({ code: "", percent: 10, amount: 0, maxUses: "", expiresAt: "" })
			toast.ok(t("set_saved"))
			await load()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
	}
	async function remove(d: Discount) {
		if (!confirm(t("confirm_delete"))) return
		await api(`/api/discounts/${d.id}`, { method: "DELETE" }).catch((err) => toast.err(err instanceof Error ? err.message : t("error_generic")))
		await load()
	}

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-3">
				<MiniStat icon={<Ticket className="h-4 w-4" />} label={L("همه کدها", "All codes")} value={formatNumber(totals.count, locale)} />
				<MiniStat icon={<Percent className="h-4 w-4" />} label={t("active")} value={formatNumber(totals.live, locale)} />
				<MiniStat icon={<ShoppingBag className="h-4 w-4" />} label={t("disc_uses")} value={formatNumber(totals.uses, locale)} />
			</div>
			<div className="grid gap-4 lg:grid-cols-3">
				<Card title={<span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" /> {t("disc_new")}</span>} className="lg:col-span-1">
					<form onSubmit={create} className="space-y-3">
						<Field label={t("disc_code")}>
							<div className="flex gap-2">
								<Input required className="mono uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="OFF20" />
								<Button type="button" size="sm" variant="ghost" onClick={randomCode}><RefreshCw className="h-4 w-4" /></Button>
							</div>
						</Field>
						<div className="grid grid-cols-2 gap-3">
							<Field label={t("disc_percent")}><Input type="number" min={0} max={100} value={form.percent} onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })} /></Field>
							<Field label={`${t("disc_amount")} (${t("currency_irt")})`}><Input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
						</div>
						<div className="flex flex-wrap gap-1.5">
							{[5, 10, 15, 20, 30, 50].map((p) => (
								<button type="button" key={p} onClick={() => setForm({ ...form, percent: p, amount: 0 })} className={cx("chip", form.percent === p && !form.amount && "chip-on")}>{p}%</button>
							))}
						</div>
						<div className="grid grid-cols-2 gap-3">
							<Field label={t("disc_max_uses")}><Input type="number" min={1} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder="∞" /></Field>
							<Field label={t("disc_expires")}><Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></Field>
						</div>
						<Button type="submit" variant="primary" loading={saving} className="w-full"><Plus className="h-4 w-4" /> {t("disc_create")}</Button>
					</form>
				</Card>
				<Card
					title={t("disc_list")}
					className="lg:col-span-2"
					actions={
						<div className="flex items-center gap-2">
							<div className="relative">
								<Search className="pointer-events-none absolute top-1/2 end-3 h-4 w-4 -translate-y-1/2 text-muted" />
								<Input className="pe-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("disc_code")} />
							</div>
							<Button type="button" size="sm" variant="ghost" onClick={() => load().catch(() => undefined)}><RefreshCw className="h-4 w-4" /></Button>
						</div>
					}
				>
					{!items ? <div className="flex justify-center p-10"><Spinner /></div> : shown.length === 0 ? <Empty text={t("disc_empty")} /> : (
						<div className="table-wrap">
							<table className="table">
								<thead><tr><th>{t("disc_code")}</th><th>{t("disc_value")}</th><th>{t("disc_uses")}</th><th>{t("disc_expires")}</th><th>{t("status")}</th><th /></tr></thead>
								<tbody>
									{shown.map((d) => {
										const expired = d.expiresAt && new Date(d.expiresAt).getTime() < Date.now()
										const exhausted = d.maxUses != null && d.uses >= d.maxUses
										const pct = d.maxUses ? Math.min(100, Math.round((d.uses / d.maxUses) * 100)) : 0
										return (
											<tr key={d.id}>
												<td className="mono font-semibold"><span className="inline-flex items-center gap-1">{d.code}<CopyBtn value={d.code} /></span></td>
												<td className="num">{d.percent ? `${d.percent}%` : ""}{d.percent && d.amount ? " + " : ""}{d.amount ? formatNumber(d.amount, locale) : ""}</td>
												<td>
													<div className="num">{formatNumber(d.uses, locale)}{d.maxUses != null ? ` / ${formatNumber(d.maxUses, locale)}` : ""}</div>
													{d.maxUses != null && <div className="progress mt-1 w-24"><span style={{ width: `${pct}%` }} /></div>}
												</td>
												<td className="text-muted">{d.expiresAt ? <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDate(d.expiresAt, locale)}</span> : "—"}</td>
												<td><Badge tone={!d.isActive ? "muted" : expired || exhausted ? "danger" : "success"}>{!d.isActive ? t("inactive") : expired ? t("disc_expired") : exhausted ? t("disc_exhausted") : t("active")}</Badge></td>
												<td className="text-end"><Button type="button" size="sm" variant="danger" onClick={() => remove(d)}><Trash2 className="h-4 w-4" /></Button></td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					)}
				</Card>
			</div>
		</div>
	)
}

/* ---------- settings ---------- */
function SettingsTab({ initial }: { initial: StoreSettings }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [s, setS] = useState<StoreSettings>(initial)
	const [merchant, setMerchant] = useState("")
	const [saving, setSaving] = useState(false)
	const set = <K extends keyof StoreSettings>(k: K, v: StoreSettings[K]) => setS((x) => ({ ...x, [k]: v }))
	const liveMethods: Method[] = [s.usdtEnabled ? "USDT" : null, s.cardEnabled ? "CARD" : null, s.zarinpalEnabled ? "ZARINPAL" : null].filter(Boolean) as Method[]

	async function save(e: FormEvent) {
		e.preventDefault()
		setSaving(true)
		try {
			const body: Record<string, unknown> = {
				enabled: s.enabled, slug: s.slug, title: s.title, description: s.description, rules: s.rules, supportUrl: s.supportUrl,
				usdtEnabled: s.usdtEnabled, usdtAddress: s.usdtAddress, usdtNetwork: s.usdtNetwork, usdtRate: Number(s.usdtRate) || 0, usdtAutoVerify: s.usdtAutoVerify,
				cardEnabled: s.cardEnabled, cardNumber: s.cardNumber, cardHolder: s.cardHolder, cardBank: s.cardBank,
				zarinpalEnabled: s.zarinpalEnabled, zarinpalSandbox: s.zarinpalSandbox,
				requireTelegram: s.requireTelegram, requirePhone: s.requirePhone, paymentTtlMin: Number(s.paymentTtlMin) || 60,
			}
			if (merchant.trim()) body.zarinpalMerchant = merchant.trim()
			const saved = await api<StoreSettings>("/api/store/settings", { method: "PUT", json: body })
			setS(saved)
			setMerchant("")
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
	}

	return (
		<form onSubmit={save} className="grid gap-4 lg:grid-cols-2">
			<Card title={t("store_general")} className="lg:col-span-2">
				<div className="grid gap-4 md:grid-cols-2">
					<div className="tile flex flex-wrap items-center justify-between gap-3 md:col-span-2">
						<Switch checked={s.enabled} onChange={(v) => set("enabled", v)} label={t("store_enabled")} />
						<div className="flex items-center gap-2">
							<code className="mono truncate text-[11px] text-muted">{s.url}</code>
							<CopyBtn value={s.url} />
							<a className="btn btn-ghost btn-sm" href={s.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
						</div>
					</div>
					<Field label={t("store_slug")} hint={t("store_slug_hint")}><Input className="mono" value={s.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} /></Field>
					<Field label={t("store_title")}><Input value={s.title ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
					<Field label={t("store_desc")}><Textarea rows={2} value={s.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
					<Field label={t("store_rules")} hint={t("store_rules_hint")}><Textarea rows={2} value={s.rules ?? ""} onChange={(e) => set("rules", e.target.value)} /></Field>
					<Field label={t("store_support")}><Input dir="ltr" value={s.supportUrl ?? ""} onChange={(e) => set("supportUrl", e.target.value)} placeholder="https://t.me/…" /></Field>
					<Field label={t("store_ttl")} hint={t("store_ttl_hint")}><Input type="number" min={5} max={1440} value={s.paymentTtlMin} onChange={(e) => set("paymentTtlMin", Number(e.target.value))} /></Field>
					<div className="md:col-span-2">
						<SubHead title={<span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> {L("احراز خریدار", "Customer checks")}</span>} />
						<div className="flex flex-wrap gap-6">
							<Switch checked={s.requireTelegram} onChange={(v) => set("requireTelegram", v)} label={t("store_req_tg")} />
							<Switch checked={s.requirePhone} onChange={(v) => set("requirePhone", v)} label={t("store_req_phone")} />
						</div>
					</div>
				</div>
			</Card>

			<Card title={t("pay_m_USDT")} subtitle={t("pay_usdt_sub")} actions={<Switch checked={s.usdtEnabled} onChange={(v) => set("usdtEnabled", v)} />}>
				<div className={cx("space-y-3 transition", !s.usdtEnabled && "opacity-60")}>
					<Field label={t("pay_usdt_address")}>
						<div className="flex gap-2">
							<Input dir="ltr" className="mono" value={s.usdtAddress ?? ""} onChange={(e) => set("usdtAddress", e.target.value.trim())} placeholder="T…" />
							{s.usdtAddress ? <CopyBtn value={s.usdtAddress} /> : null}
						</div>
					</Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label={t("pay_usdt_network")}><Select value={s.usdtNetwork} onChange={(e) => set("usdtNetwork", e.target.value)}><option value="TRC20">TRC20 (Tron)</option></Select></Field>
						<Field label={t("pay_usdt_rate")} hint={t("pay_usdt_rate_hint")}><Input type="number" min={0} value={s.usdtRate} onChange={(e) => set("usdtRate", Number(e.target.value))} /></Field>
					</div>
					<Switch checked={s.usdtAutoVerify} onChange={(v) => set("usdtAutoVerify", v)} label={t("pay_usdt_auto")} />
				</div>
			</Card>

			<Card title={t("pay_m_CARD")} subtitle={t("pay_card_sub")} actions={<Switch checked={s.cardEnabled} onChange={(v) => set("cardEnabled", v)} />}>
				<div className={cx("space-y-3 transition", !s.cardEnabled && "opacity-60")}>
					<Field label={t("pay_card_number")}>
						<div className="flex gap-2">
							<Input dir="ltr" className="mono" inputMode="numeric" value={s.cardNumber ?? ""} onChange={(e) => set("cardNumber", e.target.value)} placeholder="6037 …" />
							{s.cardNumber ? <CopyBtn value={s.cardNumber} /> : null}
						</div>
					</Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label={t("pay_card_holder")}><Input value={s.cardHolder ?? ""} onChange={(e) => set("cardHolder", e.target.value)} /></Field>
						<Field label={t("pay_card_bank")}><Input value={s.cardBank ?? ""} onChange={(e) => set("cardBank", e.target.value)} /></Field>
					</div>
				</div>
			</Card>

			<Card title={t("pay_m_ZARINPAL")} subtitle={t("pay_zp_sub")} actions={<Switch checked={s.zarinpalEnabled} onChange={(v) => set("zarinpalEnabled", v)} />} className="lg:col-span-2">
				<div className={cx("grid gap-3 transition md:grid-cols-3", !s.zarinpalEnabled && "opacity-60")}>
					<div className="md:col-span-2">
						<Field label={t("pay_zp_merchant")} hint={s.hasZarinpal ? `${t("pay_zp_saved")}: ${s.zarinpalMerchantMasked}` : t("pay_zp_merchant_hint")}>
							<Input dir="ltr" className="mono" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder={s.hasZarinpal ? "••••••••" : "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"} />
						</Field>
					</div>
					<div className="flex items-end pb-1"><Switch checked={s.zarinpalSandbox} onChange={(v) => set("zarinpalSandbox", v)} label={t("pay_zp_sandbox")} /></div>
				</div>
			</Card>

			<div className="sticky bottom-3 z-10 lg:col-span-2">
				<div className="glass glass-2 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
					<div className="flex flex-wrap items-center gap-1.5">
						<Badge tone={s.enabled ? "success" : "muted"}>{s.enabled ? t("active") : t("inactive")}</Badge>
						{liveMethods.length ? liveMethods.map((m) => <Badge key={m} tone="cyan">{t(`pay_m_${m}` as never)}</Badge>) : <Badge tone="warning">{t("store_no_methods")}</Badge>}
						<span className="text-[11px] text-muted">{L("تغییرات تا زمان ذخیره اعمال نمی‌شود", "Changes apply after saving")}</span>
					</div>
					<Button type="submit" variant="primary" loading={saving}>{t("save")}</Button>
				</div>
			</div>
		</form>
	)
}

/* ---------- root ---------- */
export function StoreClient({ settings, isOwner, initialTab }: { settings: StoreSettings; isOwner: boolean; initialTab?: string }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const tabs: Array<{ id: Tab; label: string; icon: ReactNode }> = [
		{ id: "overview", label: t("store_tab_overview"), icon: <LayoutGrid className="h-4 w-4" /> },
		{ id: "plans", label: t("store_tab_plans"), icon: <Package className="h-4 w-4" /> },
		{ id: "discounts", label: t("store_tab_discounts"), icon: <Percent className="h-4 w-4" /> },
		{ id: "settings", label: t("store_tab_settings"), icon: <Settings2 className="h-4 w-4" /> },
	]
	const [tab, setTab] = useState<Tab>(tabs.some((x) => x.id === initialTab) ? (initialTab as Tab) : "overview")

	return (
		<div className="space-y-6 fade-up">
			<PageHeader
				title={t("store_title_page")}
				subtitle={t("store_sub")}
				actions={
					