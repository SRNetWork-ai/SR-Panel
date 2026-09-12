"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { ArrowUpDown, Check, Copy, Eye, EyeOff, Package, Pencil, Plus, RefreshCw, Search, Server, ShoppingBag, Sparkles, Trash2, Wallet as WalletIcon } from "lucide-react"
import { api } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Empty, Field, Input, Modal, Select, Spinner, SubHead, Switch, Textarea, cx, useConfirm, useToast } from "@/components/ui"
import { MiniStat } from "./parts"
import { DAY_PRESETS, TRAFFIC_PRESETS, tr, type Plan, type ServerDto } from "./types"

const emptyPlan = (): Omit<Plan, "id" | "sold" | "cost"> => ({ name: "", description: "", badge: "", trafficGB: 50, days: 30, ipLimit: 0, price: 0, oldPrice: null, targets: [], isActive: true, sortOrder: 0 })
type SortKey = "order" | "price_desc" | "price_asc" | "sold" | "name"

export function PlansTab({ isOwner }: { isOwner: boolean }) {
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
	const startNew = () => {
		setEditing(null)
		setForm(emptyPlan())
		setOpen(true)
	}
	const startEdit = (p: Plan) => {
		setEditing(p.id)
		setForm(basics(p))
		setOpen(true)
	}
	const startCopy = (p: Plan) => {
		setEditing(null)
		setForm({ ...basics(p), name: `${p.name} ${L("(کپی)", "(copy)")}`, isActive: false })
		setOpen(true)
	}

	const toggleTarget = (serverId: string, inboundId: number) =>
		setForm((f) => ({
			...f,
			targets: f.targets.some((x) => x.serverId === serverId && x.inboundId === inboundId)
				? f.targets.filter((x) => !(x.serverId === serverId && x.inboundId === inboundId))
				: [...f.targets, { serverId, inboundId }],
		}))
	const setServerAll = (s: ServerDto, on: boolean) =>
		setForm((f) => ({
			...f,
			targets: on ? [...f.targets.filter((x) => x.serverId !== s.id), ...s.inbounds.map((ib) => ({ serverId: s.id, inboundId: ib.id }))] : f.targets.filter((x) => x.serverId !== s.id),
		}))
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
				<MiniStat icon={<WalletIcon className="h-4 w-4" />} label={L("درآمد ناخالص پلن‌ها", "Gross from plans")} value={`${formatNumber(totals.revenue, locale)} ${t("currency_irt")}`} />
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
								{p.description && <p className="text-xs text-muted">{p.description}</p>}
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

			<Modal
				open={open}
				onClose={() => setOpen(false)}
				title={editing ? t("plan_edit") : t("plan_new")}
				subtitle={`${t("plan_targets")}: ${formatNumber(form.targets.length, locale)} · ${L("کانفیگ", "configs")}: ${formatNumber(configCount, locale)}`}
				size="xl"
				footer={
					<>
						<span className="me-auto text-[11px] text-warning">{form.targets.length === 0 ? L("حداقل یک اینباند انتخاب کنید", "Pick at least one inbound") : ""}</span>
						<Button type="button" onClick={() => setOpen(false)}>{t("cancel")}</Button>
						<Button type="submit" form="plan-form" variant="primary" loading={saving}>{t("save")}</Button>
					</>
				}
			>
				<form id="plan-form" onSubmit={save} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
					<div className="min-w-0 space-y-5">
						<section>
							<SubHead title={L("مشخصات", "Details")} hint={t("plan_badge_hint")} />
							<div className="grid gap-3 md:grid-cols-2">
								<Field label={t("plan_name")}><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
								<Field label={t("plan_badge")}><Input value={form.badge ?? ""} onChange={(e) => setForm({ ...form, badge: e.target.value })} /></Field>
								<div className="md:col-span-2">
									<Field label={t("plan_desc")}><Textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
								</div>
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
									const allOn = n > 0 && n === s.inbounds.length
									return (
										<div key={s.id} className="tile">
											<div className="mb-2 flex items-center justify-between gap-2">
												<div className="truncate text-sm font-semibold">{s.name}</div>
												<div className="flex shrink-0 items-center gap-1.5">
													{n > 0 && <Badge tone="violet">{formatNumber(n, locale)}</Badge>}
													<button type="button" className="chip" disabled={!s.inbounds.length} onClick={() => setServerAll(s, !allOn)}>{allOn ? L("هیچ", "None") : L("همه", "All")}</button>
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
							<p className="mt-2 text-[11px] text-muted">{L("از هر سرور یک کانفیگ ساخته می‌شود؛ چند اینباند از یک سرور در همان کانفیگ جمع می‌شوند.", "One config per server; multiple inbounds of the same server are merged into it.")}</p>
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
							<div className="flex flex-wrap gap-1.5">
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
