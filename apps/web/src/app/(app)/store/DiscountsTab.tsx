"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { Clock, Percent, Plus, RefreshCw, Search, ShoppingBag, Ticket, Trash2 } from "lucide-react"
import { api } from "@/lib/client"
import { formatDate, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Spinner, cx, useConfirm, useToast } from "@/components/ui"
import { CopyBtn, MiniStat } from "./parts"
import { tr, type Discount } from "./types"

export function DiscountsTab() {
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
			await api("/api/discounts", {
				method: "POST",
				json: {
					code: form.code,
					percent: Number(form.percent) || 0,
					amount: Number(form.amount) || 0,
					maxUses: form.maxUses === "" ? null : Number(form.maxUses),
					expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
				},
			})
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
								<Button type="button" size="sm" variant="ghost" title={L("کد تصادفی", "Random code")} onClick={randomCode}><RefreshCw className="h-4 w-4" /></Button>
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
					{!items ? (
						<div className="flex justify-center p-10"><Spinner /></div>
					) : shown.length === 0 ? (
						<Empty text={t("disc_empty")} />
					) : (
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
