"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, KeyRound, Lock, Plus, RefreshCw, ShieldCheck, Trash2, Unlink, Unlock, X } from "lucide-react"
import { api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Select, Spinner, Switch, useConfirm, useToast } from "@/components/ui"
import { CopyBtn } from "@/components/bits"
import { errMsg, fmtWhen, tr } from "./types"

type Feature = { id: string; label: string }
type Ent = { enforced: boolean; plan: string; features: string[]; code: string; expiresAt: string; status: string }
type Row = {
	code: string
	plan: string
	effective: string[]
	days: number
	note: string
	createdAt: string
	adminId: string
	activatedAt: string
	expiresAt: string
	revoked: boolean
	status: string
	adminName: string
}
type Payload = { isOwner: boolean; enforced: boolean; mine: Ent; features: Feature[]; licenses: Row[] }

const PLANS = ["FREE", "PLUS", "PRO"]

/** Premium licensing: the owner mints codes, every admin activates its own. */
export function LicenseTab() {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const L = (fa: string, en: string) => tr(locale, fa, en)

	const [data, setData] = useState<Payload | null>(null)
	const [failed, setFailed] = useState(false)
	const [busy, setBusy] = useState(false)
	const [code, setCode] = useState("")
	const [made, setMade] = useState<string[]>([])
	const [form, setForm] = useState({ count: 1, plan: "PRO", days: 365, note: "" })
	const [picks, setPicks] = useState<string[]>([])

	const load = useCallback(async () => {
		setData(await api<Payload>("/api/licenses"))
	}, [])

	useEffect(() => {
		load().catch(() => setFailed(true))
	}, [load])

	const statusLabel = (s: string) =>
		s === "active"
			? L("فعال", "Active")
			: s === "expired"
				? L("منقضی", "Expired")
				: s === "revoked"
					? L("لغو‌شده", "Revoked")
					: s === "unused"
						? L("استفاده‌نشده", "Unused")
						: L("رایگان", "Free")
	const statusTone = (s: string): "success" | "warning" | "danger" | "cyan" | "muted" =>
		s === "active" ? "success" : s === "expired" ? "warning" : s === "revoked" ? "danger" : s === "unused" ? "cyan" : "muted"

	async function post(json: Record<string, unknown>, okMsg: string) {
		setBusy(true)
		try {
			await api("/api/licenses", { method: "POST", json })
			await load()
			toast.ok(okMsg)
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setBusy(false)
		}
	}

	async function refresh() {
		setBusy(true)
		try {
			await load()
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setBusy(false)
		}
	}

	async function setEnforced(v: boolean) {
		setBusy(true)
		try {
			await api("/api/licenses", { method: "PUT", json: { enforced: v } })
			await load()
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setBusy(false)
		}
	}

	async function activate() {
		const clean = code.trim()
		if (!clean) return
		await post({ activate: clean }, L("لایسنس فعال شد", "License activated"))
		setCode("")
	}

	async function generate() {
		setBusy(true)
		try {
			const r = await api<{ created: Row[] }>("/api/licenses", {
				method: "POST",
				json: { create: { count: form.count, plan: form.plan, days: form.days, note: form.note, features: picks } },
			})
			setMade(r.created.map((x) => x.code))
			await load()
			toast.ok(L("کد لایسنس ساخته شد", "Codes created"))
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setBusy(false)
		}
	}

	async function remove(row: Row) {
		if (!(await confirm(t("confirm_delete")))) return
		await post({ code: row.code, remove: true }, L("کد حذف شد", "Code removed"))
	}

	if (failed) return <Empty text={L("اطلاعات لایسنس دریافت نشد.", "Could not load licensing data.")} />
	if (!data) return <div className="flex justify-center p-8"><Spinner /></div>

	const mine = data.mine
	const owned = new Set(mine.features)

	return (
		<div className="space-y-4">
			<Card
				title={L("لایسنس من", "My license")}
				subtitle={L("امکانات پرمیومی که روی این حساب باز است", "Premium features unlocked on this account")}
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<Badge tone={mine.plan === "PRO" ? "violet" : mine.plan === "PLUS" ? "cyan" : "muted"}>{mine.plan}</Badge>
						<Badge tone={statusTone(mine.status)}>{statusLabel(mine.status)}</Badge>
						<Button size="sm" onClick={refresh} loading={busy} title={t("refresh")}>
							<RefreshCw className="h-4 w-4" />
						</Button>
					</div>
				}
			>
				<div className="space-y-4">
					{!data.enforced && (
						<div className="tile p-3 text-xs leading-6 text-muted">
							{L("قفل لایسنس خاموش است؛ همهٔ امکانات برای همهٔ ادمین‌ها باز است.", "Licensing is off; every feature is unlocked for all admins.")}
						</div>
					)}
					<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{data.features.map((f) => {
							const on = owned.has(f.id)
							return (
								<div key={f.id} className="tile flex items-center gap-2 p-3 text-sm">
									{on ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-muted" />}
									<span className={on ? "text-fg" : "text-muted"}>{f.label}</span>
								</div>
							)
						})}
					</div>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
						{mine.code && <span className="mono" dir="ltr">{mine.code}</span>}
						<span>{L("انقضا", "Expires") + ": " + (mine.expiresAt ? fmtWhen(mine.expiresAt, locale) : L("بدون انقضا", "Never"))}</span>
					</div>
					<div className="flex flex-wrap items-end gap-2">
						<Field label={L("کد لایسنس", "License code")} hint={L("کد دریافتی از مالک پنل را وارد کنید.", "Paste the code you received from the panel owner.")}>
							<Input dir="ltr" className="mono" placeholder="SRP-XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} />
						</Field>
						<Button variant="primary" loading={busy} disabled={!code.trim()} onClick={activate}>
							<ShieldCheck className="h-4 w-4" /> {L("فعال‌سازی", "Activate")}
						</Button>
					</div>
				</div>
			</Card>

			{data.isOwner && (
				<Card title={L("ساخت کد لایسنس", "Mint license codes")} subtitle={L("کدها یک‌بارمصرف هستند و به حساب فعال‌کننده می‌چسبند", "Codes are single-use and bind to the activating account")}>
					<div className="space-y-4">
						<div className="tile p-3">
							<Switch checked={data.enforced} onChange={setEnforced} label={L("اجبار لایسنس برای ادمین‌ها", "Enforce licensing for admins")} />
							<div className="mt-1 text-xs text-muted">{L("مالک همیشه دسترسی کامل دارد. اعمال تغییر تا ۳۰ ثانیه طول می‌کشد.", "The owner always has full access. Changes apply within 30s.")}</div>
						</div>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
							<Field label={L("تعداد", "Count")}>
								<Input type="number" min={1} max={50} dir="ltr" className="num" value={form.count} onChange={(e) => setForm((f) => ({ ...f, count: Math.min(50, Math.max(1, Math.round(Number(e.target.value) || 1))) }))} />
							</Field>
							<Field label={L("طرح", "Plan")} hint={L("PRO = همهٔ امکانات", "PRO = everything")}>
								<Select value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}>
									{PLANS.map((p) => (
										<option key={p} value={p}>{p}</option>
									))}
								</Select>
							</Field>
							<Field label={L("مدت (روز)", "Validity (days)")} hint={L("صفر = بدون انقضا", "0 = perpetual")}>
								<Input type="number" min={0} max={3650} dir="ltr" className="num" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: Math.min(3650, Math.max(0, Math.round(Number(e.target.value) || 0))) }))} />
							</Field>
							<Field label={L("یادداشت", "Note")}>
								<Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value.slice(0, 200) }))} />
							</Field>
						</div>
						<div>
							<div className="mb-2 text-xs text-muted">{L("انتخاب دستی امکانات (خالی = همان طرح)", "Hand-pick features (empty = plan preset)")}</div>
							<div className="flex flex-wrap gap-1">
								{data.features.map((f) => (
									<button
										key={f.id}
										type="button"
										className={picks.includes(f.id) ? "chip chip-on" : "chip"}
										onClick={() => setPicks((cur) => (cur.includes(f.id) ? cur.filter((x) => x !== f.id) : [...cur, f.id]))}
									>
										{f.label}
									</button>
								))}
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Button variant="primary" loading={busy} onClick={generate}>
								<Plus className="h-4 w-4" /> {L("ساخت کد", "Create")}
							</Button>
							{picks.length > 0 && (
								<Button variant="ghost" onClick={() => setPicks([])}>{L("پاک کردن انتخاب", "Clear picks")}</Button>
							)}
						</div>
						{made.length > 0 && (
							<div className="glass-2 space-y-2 rounded-xl p-3">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="text-xs text-muted">{L("کدهای تازه‌ساخته", "Newly created codes")}</span>
									<CopyBtn value={made.join("\n")} label={L("کپی همه", "Copy all")} />
								</div>
								<div className="flex flex-wrap gap-2">
									{made.map((c) => (
										<span key={c} className="chip mono" dir="ltr">{c}</span>
									))}
								</div>
							</div>
						)}
					</div>
				</Card>
			)}

			{data.isOwner && (
				<Card title={L("کدهای صادرشده", "Issued codes")} subtitle={L("وضعیت، صاحب کد و مدیریت لغو/آزادسازی", "Status, owner and revoke / release")}>
					{data.licenses.length === 0 ? (
						<Empty text={L("هنوز کدی ساخته نشده است.", "No code has been minted yet.")} />
					) : (
						<div className="space-y-3">
							{data.licenses.map((row) => (
								<div key={row.code} className="tile flex flex-wrap items-center justify-between gap-3 p-3">
									<div className="min-w-0 space-y-1">
										<div className="flex flex-wrap items-center gap-2">
											<KeyRound className="h-4 w-4 text-violet-soft" />
											<span className="mono text-sm" dir="ltr">{row.code}</span>
											<CopyBtn value={row.code} />
											<Badge tone={row.plan === "PRO" ? "violet" : row.plan === "PLUS" ? "cyan" : "muted"}>{row.plan}</Badge>
											<Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
										</div>
										<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
											{row.adminName && <span>{row.adminName}</span>}
											<span>{row.days > 0 ? row.days + " " + L("روز", "days") : L("بدون انقضا", "Perpetual")}</span>
											{row.expiresAt && <span>{L("انقضا", "Expires") + ": " + fmtWhen(row.expiresAt, locale)}</span>}
											<span>{t("created_at") + ": " + fmtWhen(row.createdAt, locale)}</span>
											{row.note && <span className="max-w-[220px] truncate" title={row.note}>{row.note}</span>}
										</div>
									</div>
									<div className="flex flex-wrap items-center gap-1">
										<Button
											size="sm"
											variant="ghost"
											loading={busy}
											title={row.revoked ? L("بازگرداندن", "Restore") : L("لغو کردن", "Revoke")}
											onClick={() => post({ code: row.code, revoked: !row.revoked }, row.revoked ? L("لایسنس بازگردانده شد", "Restored") : L("لایسنس لغو شد", "Revoked"))}
										>
											{row.revoked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
										</Button>
										{row.adminId && (
											<Button size="sm" variant="ghost" loading={busy} title={L("آزادسازی کد", "Release code")} onClick={() => post({ code: row.code, release: true }, L("کد آزاد شد", "Code released"))}>
												<Unlink className="h-4 w-4" />
											</Button>
										)}
										<Button size="icon" variant="ghost" loading={busy} title={t("delete")} onClick={() => remove(row)}>
											<Trash2 className="h-4 w-4 text-danger" />
										</Button>
									</div>
								</div>
							))}
						</div>
					)}
				</Card>
			)}
		</div>
	)
}
