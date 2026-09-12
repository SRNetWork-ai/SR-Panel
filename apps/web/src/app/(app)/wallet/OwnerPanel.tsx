"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { AlertTriangle, Coins, PlusCircle, RefreshCw, Search, Settings2, Users, Wallet as WalletIcon } from "lucide-react"
import { api } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Modal, Spinner, SubHead, Switch, Textarea, cx, useToast } from "@/components/ui"
import { MiniStat } from "@/components/bits"
import { tr, type Pricing, type Reseller } from "./types"

export function OwnerPanel() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [pricing, setPricing] = useState<Pricing | null>(null)
	const [resellers, setResellers] = useState<Reseller[] | null>(null)
	const [saving, setSaving] = useState(false)
	const [q, setQ] = useState("")
	const [adjust, setAdjust] = useState<Reseller | null>(null)
	const [adj, setAdj] = useState({ amount: 0, note: "" })
	const [priceEdit, setPriceEdit] = useState<Reseller | null>(null)
	const [pe, setPe] = useState({ pricePerGB: "", pricePerDay: "" })

	const load = useCallback(async () => {
		const [p, r] = await Promise.all([api<Pricing>("/api/settings/pricing"), api<{ resellers: Reseller[] }>("/api/wallet/resellers")])
		setPricing(p)
		setResellers(r.resellers)
	}, [])
	useEffect(() => {
		load().catch(() => undefined)
	}, [load])

	const rows = useMemo(() => {
		const needle = q.trim().toLowerCase()
		if (!needle) return resellers ?? []
		return (resellers ?? []).filter((r) => `${r.username} ${r.displayName ?? ""}`.toLowerCase().includes(needle))
	}, [resellers, q])

	const totals = useMemo(() => {
		const all = resellers ?? []
		return {
			count: all.length,
			balance: all.reduce((n, r) => n + r.balance, 0),
			negative: all.filter((r) => r.balance < 0).length,
			spent: all.reduce((n, r) => n + r.spent30d, 0),
		}
	}, [resellers])

	async function savePricing(e: FormEvent) {
		e.preventDefault()
		if (!pricing) return
		setSaving(true)
		try {
			setPricing(await api<Pricing>("/api/settings/pricing", { method: "PUT", json: pricing }))
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
	}
	async function doAdjust(e: FormEvent) {
		e.preventDefault()
		if (!adjust) return
		setSaving(true)
		try {
			await api("/api/wallet/adjust", { method: "POST", json: { adminId: adjust.id, amount: Math.trunc(adj.amount), note: adj.note || null } })
			toast.ok(t("set_saved"))
			setAdjust(null)
			setAdj({ amount: 0, note: "" })
			await load()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
	}
	async function savePrice(e: FormEvent) {
		e.preventDefault()
		if (!priceEdit) return
		setSaving(true)
		try {
			await api(`/api/wallet/resellers/${priceEdit.id}`, { method: "PATCH", json: { pricePerGB: pe.pricePerGB === "" ? null : Number(pe.pricePerGB), pricePerDay: pe.pricePerDay === "" ? null : Number(pe.pricePerDay) } })
			toast.ok(t("set_saved"))
			setPriceEdit(null)
			await load()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
	}

	if (!pricing || !resellers) return <div className="flex justify-center p-10"><Spinner /></div>

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<MiniStat icon={<Users className="h-4 w-4" />} label={t("wal_resellers")} value={formatNumber(totals.count, locale)} />
				<MiniStat icon={<WalletIcon className="h-4 w-4" />} label={L("جمع موجودی", "Total balance")} value={formatNumber(totals.balance, locale)} tone={totals.balance < 0 ? "danger" : "success"} />
				<MiniStat icon={<AlertTriangle className="h-4 w-4" />} label={L("موجودی منفی", "Negative balance")} value={formatNumber(totals.negative, locale)} tone={totals.negative ? "warning" : "success"} />
				<MiniStat icon={<Coins className="h-4 w-4" />} label={t("wal_spent_30d")} value={formatNumber(totals.spent, locale)} tone="cyan" />
			</div>

			<div className="grid gap-4 lg:grid-cols-3">
				<Card title={t("wal_pricing")} subtitle={t("wal_pricing_sub")} className="lg:col-span-1">
					<form onSubmit={savePricing} className="space-y-4">
						<div className="tile space-y-2">
							<Switch checked={pricing.billingEnabled} onChange={(v) => setPricing({ ...pricing, billingEnabled: v })} label={t("wal_billing_enabled")} />
							<Switch checked={pricing.chargeOnRenew} onChange={(v) => setPricing({ ...pricing, chargeOnRenew: v })} label={t("wal_charge_renew")} />
						</div>
						<div className={cx("space-y-3", !pricing.billingEnabled && "opacity-60")}>
							<SubHead title={t("wal_unit_prices")} hint={L("مبنای محاسبهٔ هزینهٔ هر سرویس", "Base for per-service cost")} />
							<Field label={`${t("wal_price_gb")} (${t("currency_irt")})`}><Input type="number" min={0} value={pricing.pricePerGB} onChange={(e) => setPricing({ ...pricing, pricePerGB: Number(e.target.value) })} /></Field>
							<Field label={`${t("wal_price_day")} (${t("currency_irt")})`}><Input type="number" min={0} value={pricing.pricePerDay} onChange={(e) => setPricing({ ...pricing, pricePerDay: Number(e.target.value) })} /></Field>
							<Field label={`${t("wal_credit_limit")} (${t("currency_irt")})`} hint={t("wal_credit_limit_hint")}><Input type="number" min={0} value={pricing.creditLimit} onChange={(e) => setPricing({ ...pricing, creditLimit: Number(e.target.value) })} /></Field>
						</div>
						<Button type="submit" variant="primary" loading={saving} className="w-full">{t("save")}</Button>
					</form>
				</Card>

				<Card
					title={t("wal_resellers")}
					subtitle={t("wal_resellers_sub")}
					className="lg:col-span-2"
					actions={
						<div className="flex flex-wrap items-center gap-2">
							<div className="relative">
								<Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
								<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("username")} className="ps-9" />
							</div>
							<Button type="button" size="sm" variant="ghost" onClick={() => load().catch(() => undefined)}><RefreshCw className="h-4 w-4" /></Button>
						</div>
					}
				>
					{rows.length === 0 ? (
						<Empty text={t("wal_no_resellers")} />
					) : (
						<div className="table-wrap">
							<table className="table">
								<thead><tr><th>{t("username")}</th><th>{t("wal_balance")}</th><th>{t("wal_unit_prices")}</th><th>{t("wal_spent_30d")}</th><th /></tr></thead>
								<tbody>
									{rows.map((r) => (
										<tr key={r.id} className={cx(r.balance < 0 && "bg-danger/5")}>
											<td>
												<div className="flex items-center gap-1.5 font-medium">
													{r.displayName || r.username}
													{!r.isActive && <Badge tone="muted">{t("inactive")}</Badge>}
												</div>
												<div className="text-xs text-muted">@{r.username} · {formatNumber(r.clients, locale)} {t("nav_clients")}</div>
											</td>
											<td className={cx("num font-semibold", r.balance < 0 ? "text-danger" : "text-success")}>{formatNumber(r.balance, locale)}</td>
											<td className="num text-xs text-muted">
												{r.pricePerGB != null || r.pricePerDay != null
													? `${formatNumber(r.pricePerGB ?? pricing.pricePerGB, locale)} / GB · ${formatNumber(r.pricePerDay ?? pricing.pricePerDay, locale)} / ${t("plan_days")}`
													: t("wal_default_prices")}
											</td>
											<td className="num">{formatNumber(r.spent30d, locale)}</td>
											<td className="text-end">
												<div className="flex justify-end gap-1">
													<Button
														type="button"
														size="sm"
														title={t("wal_unit_prices")}
														onClick={() => {
															setPriceEdit(r)
															setPe({ pricePerGB: r.pricePerGB?.toString() ?? "", pricePerDay: r.pricePerDay?.toString() ?? "" })
														}}
													>
														<Settings2 className="h-4 w-4" />
													</Button>
													<Button type="button" size="sm" variant="primary" onClick={() => setAdjust(r)}><PlusCircle className="h-4 w-4" /> {t("wal_adjust")}</Button>
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</Card>
			</div>

			<Modal
				open={!!adjust}
				onClose={() => setAdjust(null)}
				title={t("wal_adjust")}
				subtitle={adjust ? `@${adjust.username} · ${t("wal_balance")}: ${formatNumber(adjust.balance, locale)} ${t("currency_irt")}` : undefined}
				footer={
					<>
						<Button type="button" onClick={() => setAdjust(null)}>{t("cancel")}</Button>
						<Button type="submit" form="wallet-adjust-form" variant="primary" loading={saving}>{t("save")}</Button>
					</>
				}
			>
				<form id="wallet-adjust-form" onSubmit={doAdjust} className="space-y-3">
					<Field label={`${t("ord_amount")} (${t("currency_irt")})`} hint={t("wal_adjust_hint")}>
						<Input type="number" required value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: Number(e.target.value) })} />
					</Field>
					<div className="flex flex-wrap gap-1.5">
						{[100_000, 500_000, 1_000_000, -100_000, -500_000].map((a) => (
							<button type="button" key={a} onClick={() => setAdj({ ...adj, amount: a })} className={cx("chip", adj.amount === a && "chip-on")}>{a > 0 ? "+" : ""}{formatNumber(a, locale)}</button>
						))}
					</div>
					{adjust && (
						<div className="tile num text-xs">
							{L("موجودی پس از تغییر", "Balance after")}: <b className={cx(adjust.balance + Math.trunc(adj.amount || 0) < 0 ? "text-danger" : "text-success")}>{formatNumber(adjust.balance + Math.trunc(adj.amount || 0), locale)}</b> {t("currency_irt")}
						</div>
					)}
					<Field label={t("wal_note")}><Textarea rows={2} value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} /></Field>
				</form>
			</Modal>

			<Modal
				open={!!priceEdit}
				onClose={() => setPriceEdit(null)}
				title={t("wal_unit_prices")}
				subtitle={priceEdit ? `@${priceEdit.username}` : undefined}
				footer={
					<>
						<Button type="button" onClick={() => setPriceEdit(null)}>{t("cancel")}</Button>
						<Button type="submit" form="wallet-price-form" variant="primary" loading={saving}>{t("save")}</Button>
					</>
				}
			>
				<form id="wallet-price-form" onSubmit={savePrice} className="grid gap-3 sm:grid-cols-2">
					<Field label={t("wal_price_gb")} hint={t("wal_price_override_hint")}>
						<Input type="number" min={0} value={pe.pricePerGB} onChange={(e) => setPe({ ...pe, pricePerGB: e.target.value })} placeholder={String(pricing.pricePerGB)} />
					</Field>
					<Field label={t("wal_price_day")}>
						<Input type="number" min={0} value={pe.pricePerDay} onChange={(e) => setPe({ ...pe, pricePerDay: e.target.value })} placeholder={String(pricing.pricePerDay)} />
					</Field>
				</form>
			</Modal>
		</div>
	)
}
