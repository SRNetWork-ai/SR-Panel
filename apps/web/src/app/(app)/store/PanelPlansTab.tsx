"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { Check, Clock, ExternalLink, KeyRound, Package, Plus, RefreshCw, Send, ShieldCheck, Trash2, Users } from "lucide-react"
import { api } from "@/lib/client"
import { formatDate, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Spinner, cx, useToast } from "@/components/ui"
import { PanelAccounts, type PanelAccount, type PanelCreds } from "./PanelAccounts"
import { CopyBtn, MiniStat } from "./parts"
import { tr } from "./types"

/* mirrors the DTOs of /api/settings/panel-plans */
type PanelLink = {
	planId: string
	enabled: boolean
	gb: number
	days: number
	clients: number
	prefix: string
	grantAccess: boolean
	topUp: boolean
	note: string
	planName: string
	price: string
	planTrafficGB: number
	planDays: number
	planActive: boolean
	sold: number
	effectiveGB: number
	effectiveDays: number
}
type PlanOption = { id: string; name: string; price: string; trafficGB: number; days: number; isActive: boolean; linked: boolean }
type Pending = { orderId: string; adminId: string; username: string; renewal: boolean; delivered: string[]; createdAt: string; hasPassword: boolean; customer: string; loginUrl: string }
type Data = { links: PanelLink[]; plans: PlanOption[]; accounts: PanelAccount[]; pending: Pending[] }

type Draft = { planId: string; enabled: boolean; gb: number; days: number; clients: number; prefix: string; grantAccess: boolean; topUp: boolean; note: string }
const emptyDraft = (): Draft => ({ planId: "", enabled: true, gb: 0, days: 0, clients: 0, prefix: "sp", grantAccess: true, topUp: true, note: "" })

export function PanelPlansTab() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [data, setData] = useState<Data | null>(null)
	const [error, setError] = useState("")
	const [draft, setDraft] = useState<Draft>(emptyDraft())
	const [saving, setSaving] = useState(false)
	const [creds, setCreds] = useState<(PanelCreds & { note: string }) | null>(null)

	const load = useCallback(async () => {
		try {
			setData(await api<Data>("/api/settings/panel-plans"))
			setError("")
		} catch (err) {
			setError(err instanceof Error ? err.message : t("error_generic"))
		}
	}, [t])
	useEffect(() => {
		load().catch(() => undefined)
	}, [load])

	const totals = useMemo(() => {
		const links = data?.links ?? []
		return { links: links.length, live: links.filter((l) => l.enabled).length, sold: data?.accounts.length ?? 0, pending: data?.pending.length ?? 0 }
	}, [data])

	const edit = (link: PanelLink) => {
		setDraft({ planId: link.planId, enabled: link.enabled, gb: link.gb, days: link.days, clients: link.clients, prefix: link.prefix, grantAccess: link.grantAccess, topUp: link.topUp, note: link.note })
		toast.ok(L("پلن در فرم بار شد", "Loaded into the form"))
	}

	async function save(e: FormEvent) {
		e.preventDefault()
		if (!draft.planId) return
		setSaving(true)
		try {
			await api("/api/settings/panel-plans", { method: "PUT", json: draft })
			toast.ok(t("set_saved"))
			setDraft(emptyDraft())
			await load()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
	}

	async function unlink(link: PanelLink) {
		await api(`/api/settings/panel-plans?planId=${link.planId}`, { method: "DELETE" }).catch((err) => toast.err(err instanceof Error ? err.message : t("error_generic")))
		await load()
	}

	async function reveal(p: Pending) {
		try {
			const res = await api<PanelCreds>("/api/settings/panel-plans", { method: "PATCH", json: { orderId: p.orderId } })
			setCreds({ ...res, note: L("این گذرواژه فقط همین یک بار نمایش داده می‌شود", "This password is shown only once") })
			await load()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		}
	}

	const pkg = (gb: number, days: number, clients: number) =>
		[gb > 0 ? `${formatNumber(gb, locale)} ${L("گیگ", "GB")}` : L("نامحدود", "Unlimited"), days > 0 ? `${formatNumber(days, locale)} ${L("روز", "days")}` : L("بی‌انقضا", "No expiry"), clients > 0 ? `${formatNumber(clients, locale)} ${L("کاربر", "clients")}` : L("کاربر نامحدود", "Unlimited clients")].join(" · ")

	if (error)
		return (
			<Card title={L("پنل اشتراکی", "Shared panels")} actions={<Badge tone="violet">PRO</Badge>}>
				<Empty text={error} action={<Button type="button" size="sm" variant="ghost" onClick={() => load().catch(() => undefined)}><RefreshCw className="h-4 w-4" /> {L("تلاش دوباره", "Retry")}</Button>} />
			</Card>
		)
	if (!data) return <div className="flex justify-center p-10"><Spinner /></div>

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-4">
				<MiniStat icon={<Package className="h-4 w-4" />} label={L("پلن‌های وصل‌شده", "Linked plans")} value={formatNumber(totals.links, locale)} />
				<MiniStat icon={<Check className="h-4 w-4" />} label={t("active")} value={formatNumber(totals.live, locale)} />
				<MiniStat icon={<Users className="h-4 w-4" />} label={L("زیرپنل فروخته‌شده", "Sub-panels sold")} value={formatNumber(totals.sold, locale)} />
				<MiniStat icon={<Send className="h-4 w-4" />} label={L("در انتظار تحویل", "Awaiting handover")} value={formatNumber(totals.pending, locale)} />
			</div>

			{creds && (
				<Card title={<span className="inline-flex items-center gap-2"><KeyRound className="h-4 w-4" /> {L("اطلاعات ورود زیرپنل", "Sub-panel credentials")}</span>} actions={<Button type="button" size="sm" variant="ghost" onClick={() => setCreds(null)}>{L("بستن", "Close")}</Button>}>
					<div className="grid gap-3 sm:grid-cols-3">
						<div className="tile"><div className="label">{L("نام کاربری", "Username")}</div><div className="mono inline-flex items-center gap-1">{creds.username}<CopyBtn value={creds.username} /></div></div>
						<div className="tile"><div className="label">{L("گذرواژه", "Password")}</div><div className="mono inline-flex items-center gap-1">{creds.password}<CopyBtn value={creds.password} /></div></div>
						<div className="tile"><div className="label">{L("ورود", "Login")}</div><a className="mono inline-flex items-center gap-1" href={creds.loginUrl} target="_blank" rel="noreferrer">{creds.loginUrl}<ExternalLink className="h-3.5 w-3.5" /></a></div>
					</div>
					<div className="mt-2 text-xs text-muted">{creds.note}</div>
				</Card>
			)}

			<div className="grid gap-4 lg:grid-cols-3">
				<Card
					title={<span className="inline-flex items-center gap-2"><Plus className="h-4 w-4" /> {L("اتصال پلن به زیرپنل", "Link a plan")}</span>}
					subtitle={L("خریدار به‌جای اشتراک، یک پنل نمایندگی می‌گیرد", "The buyer receives a reseller panel instead of a subscription")}
					actions={<Badge tone="violet">PRO</Badge>}
					className="lg:col-span-1"
				>
					<form onSubmit={save} className="space-y-3">
						<Field label={L("پلن فروشگاه", "Store plan")}>
							<select className="input" required value={draft.planId} onChange={(e) => setDraft({ ...draft, planId: e.target.value })}>
								<option value="">{L("یک پلن انتخاب کنید", "Pick a plan")}</option>
								{data.plans.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name} · {formatNumber(Number(p.price), locale)} {t("currency_irt")}{p.linked ? " ✓" : ""}
									</option>
								))}
							</select>
						</Field>
						<div className="grid grid-cols-2 gap-3">
							<Field label={L("ترافیک (گیگ)", "Traffic (GB)")}><Input type="number" min={0} value={draft.gb} onChange={(e) => setDraft({ ...draft, gb: Number(e.target.value) })} placeholder="0" /></Field>
							<Field label={L("مدت (روز)", "Days")}><Input type="number" min={0} value={draft.days} onChange={(e) => setDraft({ ...draft, days: Number(e.target.value) })} placeholder="0" /></Field>
							<Field label={L("سقف کاربر", "Client slots")}><Input type="number" min={0} value={draft.clients} onChange={(e) => setDraft({ ...draft, clients: Number(e.target.value) })} placeholder="0" /></Field>
							<Field label={L("پیشوند نام کاربری", "Username prefix")}><Input className="mono" maxLength={12} value={draft.prefix} onChange={(e) => setDraft({ ...draft, prefix: e.target.value })} placeholder="sp" /></Field>
						</div>
						<div className="text-xs text-muted">{L("صفر = همان مقدار پلن (و اگر پلن هم صفر باشد، نامحدود)", "Zero = take the plan value (unlimited when the plan is zero too)")}</div>
						<div className="flex flex-wrap gap-1.5">
							<button type="button" onClick={() => setDraft({ ...draft, enabled: !draft.enabled })} className={cx("chip", draft.enabled && "chip-on")}>{L("فعال", "Enabled")}</button>
							<button type="button" onClick={() => setDraft({ ...draft, grantAccess: !draft.grantAccess })} className={cx("chip", draft.grantAccess && "chip-on")}>{L("دسترسی اینباندهای پلن", "Grant plan inbounds")}</button>
							<button type="button" onClick={() => setDraft({ ...draft, topUp: !draft.topUp })} className={cx("chip", draft.topUp && "chip-on")}>{L("شارژ همان زیرپنل", "Top up the same panel")}</button>
						</div>
						<Field label={L("یادداشت", "Note")}><Input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
						<div className="flex gap-2">
							<Button type="submit" variant="primary" loading={saving} className="flex-1"><ShieldCheck className="h-4 w-4" /> {L("ذخیره اتصال", "Save link")}</Button>
							{draft.planId && <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(emptyDraft())}>{L("پاک کردن", "Clear")}</Button>}
						</div>
					</form>
				</Card>

				<Card
					title={L("پلن‌های وصل‌شده", "Linked plans")}
					className="lg:col-span-2"
					actions={<Button type="button" size="sm" variant="ghost" onClick={() => load().catch(() => undefined)}><RefreshCw className="h-4 w-4" /></Button>}
				>
					{data.links.length === 0 ? (
						<Empty text={L("هنوز هیچ پلنی به پنل اشتراکی وصل نشده است", "No plan is linked to a shared panel yet")} />
					) : (
						<div className="table-wrap">
							<table className="table">
								<thead>
									<tr>
										<th>{L("پلن", "Plan")}</th>
										<th>{L("بسته زیرپنل", "Package")}</th>
										<th>{L("پیشوند", "Prefix")}</th>
										<th>{L("فروش", "Sold")}</th>
										<th>{t("status")}</th>
										<th />
									</tr>
								</thead>
								<tbody>
									{data.links.map((l) => (
										<tr key={l.planId}>
											<td>
												<div className="font-semibold">{l.planName}</div>
												<div className="num text-xs text-muted">{formatNumber(Number(l.price), locale)} {t("currency_irt")}</div>
											</td>
											<td className="text-xs">
												<div>{pkg(l.effectiveGB, l.effectiveDays, l.clients)}</div>
												<div className="text-muted">{l.grantAccess ? L("با دسترسی اینباند", "With inbounds") : L("بدون دسترسی", "No inbounds")} · {l.topUp ? L("شارژ همان پنل", "Top-up") : L("پنل جدید", "New panel")}</div>
											</td>
											<td className="mono">{l.prefix}</td>
											<td className="num">{formatNumber(l.sold, locale)}</td>
											<td><Badge tone={!l.enabled ? "muted" : l.planActive ? "success" : "warning"}>{!l.enabled ? t("inactive") : l.planActive ? t("active") : L("پلن غیرفعال", "Plan off")}</Badge></td>
											<td className="text-end">
												<div className="flex justify-end gap-1">
													<Button type="button" size="sm" variant="ghost" title={L("ویرایش", "Edit")} onClick={() => edit(l)}><Package className="h-4 w-4" /></Button>
													<Button type="button" size="sm" variant="danger" title={L("قطع اتصال", "Unlink")} onClick={() => unlink(l)}><Trash2 className="h-4 w-4" /></Button>
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

			{data.pending.length > 0 && (
				<Card title={<span className="inline-flex items-center gap-2"><Send className="h-4 w-4" /> {L("در انتظار تحویل دستی", "Awaiting manual handover")}</span>} subtitle={L("نه تلگرام و نه ایمیل خریدار در دسترس نبود", "Neither Telegram nor e-mail reached the buyer")}>
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr>
									<th>{L("مشتری", "Customer")}</th>
									<th>{L("نام کاربری", "Username")}</th>
									<th>{L("زمان", "When")}</th>
									<th />
								</tr>
							</thead>
							<tbody>
								{data.pending.map((p) => (
									<tr key={p.orderId}>
										<td>
											<div>{p.customer || "—"}</div>
											<div className="text-xs text-muted">{p.renewal ? L("شارژ بسته", "Top-up") : L("زیرپنل تازه", "New sub-panel")}</div>
										</td>
										<td className="mono"><span className="inline-flex items-center gap-1">{p.username}<CopyBtn value={p.username} /></span></td>
										<td className="text-muted text-xs"><span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDate(p.createdAt, locale)}</span></td>
										<td className="text-end">
											{p.hasPassword ? (
												<Button type="button" size="sm" variant="primary" onClick={() => reveal(p)}><KeyRound className="h-4 w-4" /> {L("نمایش گذرواژه", "Reveal")}</Button>
											) : (
												<Badge tone="muted">{L("با بازنشانی گذرواژه تحویل بدهید", "Use password reset")}</Badge>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Card>
			)}

			<PanelAccounts accounts={data.accounts} onCreds={(c) => setCreds({ ...c, note: L("گذرواژه تازه؛ نشست‌های قبلی این زیرپنل بسته شد", "New password; previous sessions were revoked") })} onReload={() => load().catch(() => undefined)} />
		</div>
	)
}
