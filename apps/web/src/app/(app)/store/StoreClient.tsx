"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Check, Copy, CreditCard, ExternalLink, LayoutGrid, Package, Percent, Plus, RefreshCw, Settings2, ShoppingBag, Store, Trash2, Wallet as WalletIcon } from "lucide-react"
import { api, copyText } from "@/lib/client"
import { formatDate, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Switch, Textarea, cx, useConfirm, useToast } from "@/components/ui"

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

const ORDER_TONE: Record<string, "success" | "warning" | "danger" | "muted" | "violet" | "cyan"> = { PENDING: "warning", PAID: "cyan", FULFILLED: "success", CANCELED: "muted", EXPIRED: "danger" }

/* ---------- overview ---------- */
function OverviewTab({ onGoto }: { onGoto: (tab: Tab) => void }) {
	const t = useT()
	const locale = useLocale()
	const [data, setData] = useState<Overview | null>(null)
	const [copied, setCopied] = useState(false)
	const load = useCallback(async () => setData(await api<Overview>("/api/store/overview")), [])
	useEffect(() => {
		load().catch(() => undefined)
	}, [load])
	if (!data) return <div className="flex justify-center p-10"><Spinner /></div>
	const total = Object.values(data.counts).reduce((a, b) => a + b, 0)
	return (
		<div className="space-y-6">
			{!data.enabled && (
				<div className="glass flex flex-wrap items-center justify-between gap-3 border border-warning/30 p-4">
					<div className="text-sm">{t("store_disabled_hint")}</div>
					<Button onClick={() => onGoto("settings")}><Settings2 className="h-4 w-4" /> {t("store_tab_settings")}</Button>
				</div>
			)}
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<Stat label={t("store_revenue_30d")} value={<span className="num">{formatNumber(data.revenue30d, locale)}</span>} sub={t("currency_irt")} icon={<WalletIcon className="h-5 w-5" />} />
				<Stat label={t("store_orders_30d")} value={<span className="num">{formatNumber(total, locale)}</span>} sub={`${formatNumber(data.counts.FULFILLED ?? 0, locale)} ${t("ord_st_FULFILLED")}`} icon={<ShoppingBag className="h-5 w-5" />} accent="cyan" />
				<Stat label={t("pay_pending_review")} value={<span className="num">{formatNumber(data.pendingReview, locale)}</span>} icon={<CreditCard className="h-5 w-5" />} accent={data.pendingReview ? "warning" : "violet"} />
				<Stat label={t("plan_active_count")} value={<span className="num">{formatNumber(data.activePlans, locale)}</span>} icon={<Package className="h-5 w-5" />} accent="success" />
			</div>
			<div className="grid gap-4 lg:grid-cols-3">
				<Card title={t("store_link")} className="lg:col-span-1">
					{data.url ? (
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<input readOnly value={data.url} className="input mono flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
								<Button size="sm" onClick={async () => { if (await copyText(data.url!)) { setCopied(true); setTimeout(() => setCopied(false), 1500) } }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>
								<a className="btn btn-ghost btn-sm" href={data.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
							</div>
							<div className="flex flex-wrap gap-1.5">
								{data.methods.length ? data.methods.map((m) => <Badge key={m} tone="cyan">{t(`pay_m_${m}` as never)}</Badge>) : <Badge tone="warning">{t("store_no_methods")}</Badge>}
							</div>
							<p className="text-xs text-muted">{t("store_tg_hint")} <code className="kbd">/start store_{data.slug}</code></p>
						</div>
					) : <Empty text={t("store_disabled_hint")} />}
				</Card>
				<Card title={t("ord_recent")} className="lg:col-span-2" actions={<Button size="sm" variant="ghost" onClick={() => load()}><RefreshCw className="h-4 w-4" /></Button>}>
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
		</div>
	)
}

/* ---------- plans ---------- */
const emptyPlan = (): Omit<Plan, "id" | "sold" | "cost"> => ({ name: "", description: "", badge: "", trafficGB: 50, days: 30, ipLimit: 0, price: 0, oldPrice: null, targets: [], isActive: true, sortOrder: 0 })

function PlansTab({ isOwner }: { isOwner: boolean }) {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const [plans, setPlans] = useState<Plan[] | null>(null)
	const [servers, setServers] = useState<ServerDto[]>([])
	const [open, setOpen] = useState(false)
	const [editing, setEditing] = useState<string | null>(null)
	const [form, setForm] = useState(emptyPlan())
	const [saving, setSaving] = useState(false)

	const load = useCallback(async () => {
		const [p, s] = await Promise.all([api<{ plans: Plan[] }>("/api/plans"), api<ServerDto[]>("/api/servers")])
		setPlans(p.plans)
		setServers(s)
	}, [])
	useEffect(() => {
		load().catch((err) => toast.err(err instanceof Error ? err.message : t("error_generic")))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [load])

	const startNew = () => { setEditing(null); setForm(emptyPlan()); setOpen(true) }
	const startEdit = (p: Plan) => { setEditing(p.id); setForm({ name: p.name, description: p.description ?? "", badge: p.badge ?? "", trafficGB: p.trafficGB, days: p.days, ipLimit: p.ipLimit, price: p.price, oldPrice: p.oldPrice, targets: p.targets, isActive: p.isActive, sortOrder: p.sortOrder }); setOpen(true) }
	const toggleTarget = (serverId: string, inboundId: number) =>
		setForm((f) => ({ ...f, targets: f.targets.some((x) => x.serverId === serverId && x.inboundId === inboundId) ? f.targets.filter((x) => !(x.serverId === serverId && x.inboundId === inboundId)) : [...f.targets, { serverId, inboundId }] }))

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
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm text-muted">{t("plan_hint")}</p>
				<Button variant="primary" onClick={startNew}><Plus className="h-4 w-4" /> {t("plan_new")}</Button>
			</div>
			{!plans ? <div className="flex justify-center p-10"><Spinner /></div> : plans.length === 0 ? <Empty text={t("plan_empty")} action={<Button variant="primary" onClick={startNew}><Plus className="h-4 w-4" /> {t("plan_new")}</Button>} /> : (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{plans.map((p) => (
						<div key={p.id} className={cx("glass relative flex flex-col gap-3 p-5", !p.isActive && "opacity-60")}>
							{p.badge && <span className="badge absolute -top-2 start-4 bg-violet/30 text-fg neon-ring">{p.badge}</span>}
							<div className="flex items-start justify-between gap-2">
								<div>
									<div className="font-semibold">{p.name}</div>
									{isOwner && p.admin && <div className="text-xs text-muted">@{p.admin.username}</div>}
								</div>
								<Badge tone={p.isActive ? "success" : "muted"}>{p.isActive ? t("active") : t("inactive")}</Badge>
							</div>
							<div className="flex items-baseline gap-2">
								<span className="num text-2xl font-bold neon-text">{formatNumber(p.price, locale)}</span>
								<span className="text-xs text-muted">{t("currency_irt")}</span>
								{p.oldPrice ? <span className="num text-xs text-muted line-through">{formatNumber(p.oldPrice, locale)}</span> : null}
							</div>
							<div className="grid grid-cols-3 gap-2 text-center text-xs">
								<div className="glass-2 rounded-xl p-2"><div className="num font-semibold">{p.trafficGB || "∞"}</div><div className="text-muted">GB</div></div>
								<div className="glass-2 rounded-xl p-2"><div className="num font-semibold">{p.days || "∞"}</div><div className="text-muted">{t("plan_days")}</div></div>
								<div className="glass-2 rounded-xl p-2"><div className="num font-semibold">{p.ipLimit || "∞"}</div><div className="text-muted">{t("plan_ip")}</div></div>
							</div>
							{p.description && <p className="text-xs text-muted">{p.description}</p>}
							<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
								<span>{t("plan_sold")}: <b className="num text-fg">{formatNumber(p.sold, locale)}</b> · {t("plan_targets")}: <b className="num text-fg">{p.targets.length}</b></span>
								{p.cost > 0 && <span title={t("wal_cost_hint")}>{t("wal_cost")}: <b className="num text-fg">{formatNumber(p.cost, locale)}</b></span>}
							</div>
							<div className="mt-auto flex gap-2">
								<Button size="sm" onClick={() => startEdit(p)} className="flex-1">{t("edit")}</Button>
								<Button size="sm" variant="ghost" onClick={() => toggleActive(p)}>{p.isActive ? t("disabled") : t("enabled")}</Button>
								<Button size="sm" variant="danger" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></Button>
							</div>
						</div>
					))}
				</div>
			)}

			<Modal open={open} onClose={() => setOpen(false)} title={editing ? t("plan_edit") : t("plan_new")} wide footer={<><Button onClick={() => setOpen(false)}>{t("cancel")}</Button><Button variant="primary" loading={saving} onClick={(e) => save(e as unknown as FormEvent)}>{t("save")}</Button></>}>
				<form onSubmit={save} className="grid gap-4 md:grid-cols-2">
					<Field label={t("plan_name")}><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
					<Field label={t("plan_badge")} hint={t("plan_badge_hint")}><Input value={form.badge ?? ""} onChange={(e) => setForm({ ...form, badge: e.target.value })} /></Field>
					<Field label={`${t("plan_traffic")} (GB)`}><Input type="number" min={0} value={form.trafficGB} onChange={(e) => setForm({ ...form, trafficGB: Number(e.target.value) })} /></Field>
					<Field label={t("plan_days")}><Input type="number" min={0} value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} /></Field>
					<Field label={t("plan_ip")}><Input type="number" min={0} value={form.ipLimit} onChange={(e) => setForm({ ...form, ipLimit: Number(e.target.value) })} /></Field>
					<Field label={t("plan_sort")}><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></Field>
					<Field label={`${t("plan_price")} (${t("currency_irt")})`}><Input type="number" min={0} required value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></Field>
					<Field label={t("plan_old_price")} hint={t("plan_old_price_hint")}><Input type="number" min={0} value={form.oldPrice ?? ""} onChange={(e) => setForm({ ...form, oldPrice: e.target.value ? Number(e.target.value) : null })} /></Field>
					<div className="md:col-span-2"><Field label={t("plan_desc")}><Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
					<div className="md:col-span-2">
						<Field label={t("plan_targets")} hint={t("plan_targets_hint")}>
							<div className="grid gap-2 sm:grid-cols-2">
								{servers.map((s) => (
									<div key={s.id} className="glass-2 rounded-xl p-3">
										<div className="mb-2 text-sm font-semibold">{s.name}</div>
										<div className="flex flex-wrap gap-1.5">
											{s.inbounds.map((ib) => {
												const on = form.targets.some((x) => x.serverId === s.id && x.inboundId === ib.id)
												return (
													<button type="button" key={ib.id} onClick={() => toggleTarget(s.id, ib.id)} className={cx("badge cursor-pointer transition", on ? "bg-violet/30 text-fg neon-ring" : "text-muted hover:text-fg")}>
														{ib.remark || `#${ib.id}`}{ib.protocol ? ` · ${ib.protocol}` : ""}{ib.port ? `:${ib.port}` : ""}
													</button>
												)
											})}
											{!s.inbounds.length && <span className="text-xs text-muted">{t("plan_no_inbounds")}</span>}
										</div>
									</div>
								))}
								{!servers.length && <Empty text={t("plan_no_servers")} />}
							</div>
						</Field>
					</div>
					<div className="md:col-span-2"><Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} label={t("plan_visible")} /></div>
					<button type="submit" className="hidden" />
				</form>
			</Modal>
		</div>
	)
}

/* ---------- discounts ---------- */
function DiscountsTab() {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const [items, setItems] = useState<Discount[] | null>(null)
	const [form, setForm] = useState({ code: "", percent: 10, amount: 0, maxUses: "" as string | number, expiresAt: "" })
	const [saving, setSaving] = useState(false)
	const load = useCallback(async () => setItems((await api<{ discounts: Discount[] }>("/api/discounts")).discounts), [])
	useEffect(() => {
		load().catch(() => undefined)
	}, [load])

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
		<div className="grid gap-4 lg:grid-cols-3">
			<Card title={t("disc_new")} className="lg:col-span-1">
				<form onSubmit={create} className="space-y-3">
					<Field label={t("disc_code")}><Input required className="mono uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="OFF20" /></Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label={t("disc_percent")}><Input type="number" min={0} max={100} value={form.percent} onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })} /></Field>
						<Field label={`${t("disc_amount")} (${t("currency_irt")})`}><Input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<Field label={t("disc_max_uses")}><Input type="number" min={1} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder="∞" /></Field>
						<Field label={t("disc_expires")}><Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></Field>
					</div>
					<Button type="submit" variant="primary" loading={saving} className="w-full"><Plus className="h-4 w-4" /> {t("disc_create")}</Button>
				</form>
			</Card>
			<Card title={t("disc_list")} className="lg:col-span-2">
				{!items ? <div className="flex justify-center p-10"><Spinner /></div> : items.length === 0 ? <Empty text={t("disc_empty")} /> : (
					<div className="table-wrap">
						<table className="table">
							<thead><tr><th>{t("disc_code")}</th><th>{t("disc_value")}</th><th>{t("disc_uses")}</th><th>{t("disc_expires")}</th><th>{t("status")}</th><th /></tr></thead>
							<tbody>
								{items.map((d) => {
									const expired = d.expiresAt && new Date(d.expiresAt).getTime() < Date.now()
									const exhausted = d.maxUses != null && d.uses >= d.maxUses
									return (
										<tr key={d.id}>
											<td className="mono font-semibold">{d.code}</td>
											<td className="num">{d.percent ? `${d.percent}%` : ""}{d.percent && d.amount ? " + " : ""}{d.amount ? formatNumber(d.amount, locale) : ""}</td>
											<td className="num">{formatNumber(d.uses, locale)}{d.maxUses != null ? ` / ${formatNumber(d.maxUses, locale)}` : ""}</td>
											<td className="text-muted">{d.expiresAt ? formatDate(d.expiresAt, locale) : "—"}</td>
											<td><Badge tone={!d.isActive ? "muted" : expired || exhausted ? "danger" : "success"}>{!d.isActive ? t("inactive") : expired ? t("disc_expired") : exhausted ? t("disc_exhausted") : t("active")}</Badge></td>
											<td className="text-end"><Button size="sm" variant="danger" onClick={() => remove(d)}><Trash2 className="h-4 w-4" /></Button></td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				)}
			</Card>
		</div>
	)
}

/* ---------- settings ---------- */
function SettingsTab({ initial }: { initial: StoreSettings }) {
	const t = useT()
	const toast = useToast()
	const [s, setS] = useState<StoreSettings>(initial)
	const [merchant, setMerchant] = useState("")
	const [saving, setSaving] = useState(false)
	const set = <K extends keyof StoreSettings>(k: K, v: StoreSettings[K]) => setS((x) => ({ ...x, [k]: v }))

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
					<div className="md:col-span-2"><Switch checked={s.enabled} onChange={(v) => set("enabled", v)} label={t("store_enabled")} /></div>
					<Field label={t("store_slug")} hint={`${t("store_slug_hint")} ${s.url}`}><Input className="mono" value={s.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} /></Field>
					<Field label={t("store_title")}><Input value={s.title ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
					<Field label={t("store_desc")}><Textarea rows={2} value={s.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
					<Field label={t("store_rules")} hint={t("store_rules_hint")}><Textarea rows={2} value={s.rules ?? ""} onChange={(e) => set("rules", e.target.value)} /></Field>
					<Field label={t("store_support")}><Input dir="ltr" value={s.supportUrl ?? ""} onChange={(e) => set("supportUrl", e.target.value)} placeholder="https://t.me/…" /></Field>
					<Field label={t("store_ttl")} hint={t("store_ttl_hint")}><Input type="number" min={5} max={1440} value={s.paymentTtlMin} onChange={(e) => set("paymentTtlMin", Number(e.target.value))} /></Field>
					<div className="flex flex-wrap gap-6 md:col-span-2">
						<Switch checked={s.requireTelegram} onChange={(v) => set("requireTelegram", v)} label={t("store_req_tg")} />
						<Switch checked={s.requirePhone} onChange={(v) => set("requirePhone", v)} label={t("store_req_phone")} />
					</div>
				</div>
			</Card>

			<Card title={t("pay_m_USDT")} subtitle={t("pay_usdt_sub")} actions={<Switch checked={s.usdtEnabled} onChange={(v) => set("usdtEnabled", v)} />}>
				<div className="space-y-3">
					<Field label={t("pay_usdt_address")}><Input dir="ltr" className="mono" value={s.usdtAddress ?? ""} onChange={(e) => set("usdtAddress", e.target.value.trim())} placeholder="T…" /></Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label={t("pay_usdt_network")}><Select value={s.usdtNetwork} onChange={(e) => set("usdtNetwork", e.target.value)}><option value="TRC20">TRC20 (Tron)</option></Select></Field>
						<Field label={t("pay_usdt_rate")} hint={t("pay_usdt_rate_hint")}><Input type="number" min={0} value={s.usdtRate} onChange={(e) => set("usdtRate", Number(e.target.value))} /></Field>
					</div>
					<Switch checked={s.usdtAutoVerify} onChange={(v) => set("usdtAutoVerify", v)} label={t("pay_usdt_auto")} />
				</div>
			</Card>

			<Card title={t("pay_m_CARD")} subtitle={t("pay_card_sub")} actions={<Switch checked={s.cardEnabled} onChange={(v) => set("cardEnabled", v)} />}>
				<div className="space-y-3">
					<Field label={t("pay_card_number")}><Input dir="ltr" className="mono" inputMode="numeric" value={s.cardNumber ?? ""} onChange={(e) => set("cardNumber", e.target.value)} placeholder="6037 …" /></Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label={t("pay_card_holder")}><Input value={s.cardHolder ?? ""} onChange={(e) => set("cardHolder", e.target.value)} /></Field>
						<Field label={t("pay_card_bank")}><Input value={s.cardBank ?? ""} onChange={(e) => set("cardBank", e.target.value)} /></Field>
					</div>
				</div>
			</Card>

			<Card title={t("pay_m_ZARINPAL")} subtitle={t("pay_zp_sub")} actions={<Switch checked={s.zarinpalEnabled} onChange={(v) => set("zarinpalEnabled", v)} />} className="lg:col-span-2">
				<div className="grid gap-3 md:grid-cols-3">
					<div className="md:col-span-2">
						<Field label={t("pay_zp_merchant")} hint={s.hasZarinpal ? `${t("pay_zp_saved")}: ${s.zarinpalMerchantMasked}` : t("pay_zp_merchant_hint")}>
							<Input dir="ltr" className="mono" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder={s.hasZarinpal ? "••••••••" : "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"} />
						</Field>
					</div>
					<div className="flex items-end pb-1"><Switch checked={s.zarinpalSandbox} onChange={(v) => set("zarinpalSandbox", v)} label={t("pay_zp_sandbox")} /></div>
				</div>
			</Card>

			<div className="flex justify-end lg:col-span-2">
				<Button type="submit" variant="primary" loading={saving}>{t("save")}</Button>
			</div>
		</form>
	)
}

/* ---------- root ---------- */
type Tab = "overview" | "plans" | "discounts" | "settings"

export function StoreClient({ settings, isOwner, initialTab }: { settings: StoreSettings; isOwner: boolean; initialTab?: string }) {
	const t = useT()
	const tabs: Array<{ id: Tab; label: string; icon: typeof Store }> = [
		{ id: "overview", label: t("store_tab_overview"), icon: LayoutGrid },
		{ id: "plans", label: t("store_tab_plans"), icon: Package },
		{ id: "discounts", label: t("store_tab_discounts"), icon: Percent },
		{ id: "settings", label: t("store_tab_settings"), icon: Settings2 },
	]
	const [tab, setTab] = useState<Tab>((tabs.some((x) => x.id === initialTab) ? (initialTab as Tab) : "overview"))

	return (
		<div className="space-y-6 fade-up">
			<PageHeader title={t("store_title_page")} subtitle={t("store_sub")} />
			<div className="glass flex flex-wrap gap-1 rounded-2xl p-1.5">
				{tabs.map((x) => (
					<button key={x.id} type="button" onClick={() => setTab(x.id)} className={cx("flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition", tab === x.id ? "bg-violet/20 text-fg neon-ring" : "text-muted hover:text-fg")}>
						<x.icon className="h-4 w-4" /> {x.label}
					</button>
				))}
			</div>
			{tab === "overview" && <OverviewTab onGoto={setTab} />}
			{tab === "plans" && <PlansTab isOwner={isOwner} />}
			{tab === "discounts" && <DiscountsTab />}
			{tab === "settings" && <SettingsTab initial={settings} />}
		</div>
	)
}
