"use client"

import { useEffect, useState } from "react"
import { Check, Lock, RefreshCw, Trash2 } from "lucide-react"
import { api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Select, Spinner, Switch, useConfirm, useToast } from "@/components/ui"
import { CopyBtn } from "@/components/bits"
import { fmtWhen, tr } from "./types"

type Plan = "FREE" | "PLUS" | "PRO"
type Status = "unused" | "active" | "expired" | "revoked" | "free"

type PanelLicense = {
	code: string
	plan: Plan
	activatedAt: string
	expiresAt: string
	lastCheck: string
	source: string
	note: string
	instanceId: string
	status: Status
	effective: string[]
	enforced: boolean
	forced: boolean
	api: boolean
}

type LicenseRow = {
	code: string
	plan: Plan
	days: number
	note: string
	createdAt: string
	instanceId: string
	instanceUrl: string
	expiresAt: string
	revoked: boolean
	status: Status
}

type Data = {
	isOwner: boolean
	panel: PanelLicense
	features: Array<{ id: string; label: string }>
	licenses: LicenseRow[]
}

const TONE: Record<Status, "success" | "warning" | "danger" | "muted"> = {
	active: "success",
	expired: "warning",
	revoked: "danger",
	unused: "muted",
	free: "muted",
}

/** Panel-wide premium: one 12-character code unlocks the whole install. */
export function LicenseTab() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const confirm = useConfirm()
	const [data, setData] = useState<Data | null>(null)
	const [code, setCode] = useState("")
	const [busy, setBusy] = useState("")
	const [form, setForm] = useState({ count: "1", plan: "PRO", days: "0", note: "" })
	const [made, setMade] = useState<string[]>([])

	const fail = (err: unknown) => toast.err(err instanceof Error ? err.message : String(err))

	const statusText = (s: Status) =>
		s === "active"
			? L("فعال", "Active")
			: s === "expired"
				? L("منقضی", "Expired")
				: s === "revoked"
					? L("لغو شده", "Revoked")
					: s === "unused"
						? L("استفاده نشده", "Unused")
						: L("بدون لایسنس", "No license")

	async function load() {
		try {
			setData(await api<Data>("/api/licenses"))
		} catch (err) {
			fail(err)
		}
	}

	useEffect(() => {
		void load()
	}, [])

	async function send(body: Record<string, unknown>, tag: string, done?: string) {
		setBusy(tag)
		try {
			const res = await api<{ created?: LicenseRow[] }>("/api/licenses", { method: "POST", json: body })
			if (res.created) setMade(res.created.map((l) => l.code))
			toast.ok(done ?? t("set_saved"))
			await load()
		} catch (err) {
			fail(err)
		} finally {
			setBusy("")
		}
	}

	async function activate() {
		const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "")
		if (clean.length !== 12) {
			toast.err(L("کد باید ۱۲ کاراکتر باشد", "The code must be 12 characters"))
			return
		}
		await send({ activate: clean }, "activate", L("پرمیوم فعال شد", "Premium activated"))
		setCode("")
	}

	async function toggleEnforce() {
		if (!data) return
		setBusy("enforce")
		try {
			await api("/api/licenses", { method: "PUT", json: { enforced: !data.panel.enforced } })
			await load()
		} catch (err) {
			fail(err)
		} finally {
			setBusy("")
		}
	}

	if (!data) return <Spinner />
	const p = data.panel
	const locked = p.enforced && p.status !== "active"
	const sourceText = p.source === "remote" ? L("سرور لایسنس", "License server") : p.source === "env" ? L("آفلاین", "Offline") : L("محلی", "Local")

	return (
		<div className="space-y-6">
			<Card
				title={L("لایسنس پنل", "Panel license")}
				subtitle={L("یک کد ۱۲ کاراکتری پرمیوم را برای کل این نصب باز می‌کند", "One 12-character code unlocks premium for this whole install")}
				actions={<Badge tone={locked ? "warning" : TONE[p.status]}>{locked ? L("قفل", "Locked") : statusText(p.status)}</Badge>}
			>
				<div className="space-y-4">
					<div className="grid gap-3 md:grid-cols-3">
						<div className="tile">
							<div className="text-muted">{L("پلن", "Plan")}</div>
							<div className="num">{p.status === "active" ? p.plan : "FREE"}</div>
						</div>
						<div className="tile">
							<div className="text-muted">{L("انقضا", "Expiry")}</div>
							<div>{p.expiresAt ? fmtWhen(p.expiresAt, locale) : L("بدون انقضا", "Never")}</div>
						</div>
						<div className="tile">
							<div className="text-muted">{L("آخرین بازبینی", "Last check")}</div>
							<div>{p.lastCheck ? fmtWhen(p.lastCheck, locale) : "-"}</div>
						</div>
					</div>

					<div className="tile space-y-2">
						<div className="text-muted">{L("شناسهٔ نصب — این را به فروشنده بدهید", "Install id — hand this to the vendor")}</div>
						<div className="flex items-center gap-2">
							<span className="mono">{p.instanceId}</span>
							<CopyBtn value={p.instanceId} />
						</div>
						{p.code ? (
							<div className="flex items-center gap-2">
								<span className="mono">{p.code}</span>
								<Badge tone="muted">{sourceText}</Badge>
							</div>
						) : null}
						{p.note ? <div className="text-danger">{p.note}</div> : null}
					</div>

					<div className="grid gap-3 md:grid-cols-2">
						<Field label={L("کد لایسنس (۱۲ کاراکتر)", "License code (12 chars)")} hint={L("کد را از فروشنده بگیرید", "Get the code from the vendor")}>
							<Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD2345EFGH" />
						</Field>
						<div className="flex flex-wrap items-end gap-2">
							<Button onClick={activate} loading={busy === "activate"}>
								{L("فعال‌سازی پرمیوم", "Activate premium")}
							</Button>
							{p.code ? (
								<>
									<Button onClick={() => void send({ refresh: true }, "refresh")} loading={busy === "refresh"}>
										<RefreshCw size={16} />
										{L("بازبینی", "Re-check")}
									</Button>
									<Button
										loading={busy === "clear"}
										onClick={async () => {
											if (!(await confirm(L("لایسنس این پنل حذف شود؟", "Remove this panel license?")))) return
											await send({ clear: true }, "clear", L("لایسنس حذف شد", "License removed"))
										}}
									>
										<Trash2 size={16} />
										{L("حذف لایسنس", "Remove")}
									</Button>
								</>
							) : null}
						</div>
					</div>

					<div>
						<div className="text-muted mb-2">{L("قابلیت‌های پرمیوم", "Premium features")}</div>
						<div className="grid gap-2 md:grid-cols-3">
							{data.features.map((f) => {
								const on = !p.enforced || p.effective.includes(f.id)
								return (
									<div key={f.id} className="chip flex items-center gap-2">
										{on ? <Check size={14} className="text-success" /> : <Lock size={14} className="text-muted" />}
										<span className={on ? "text-fg" : "text-muted"}>{f.label}</span>
									</div>
								)
							})}
						</div>
					</div>
				</div>
			</Card>

			{data.isOwner ? (
				<Card title={L("اجبار لایسنس", "Enforcement")} subtitle={L("تا وقتی خاموش باشد چیزی قفل نمی‌شود", "While off, nothing is locked")}>
					{p.forced ? (
						<Badge tone="violet">{L("با تنظیمات سرور اجباری شده است", "Forced by the server config")}</Badge>
					) : (
						<Switch checked={p.enforced} onChange={() => void toggleEnforce()} label={L("قابلیت‌های پرمیوم بدون لایسنس قفل باشند", "Lock premium features without a license")} />
					)}
				</Card>
			) : null}

			{data.isOwner ? (
				<Card title={L("ساخت کد لایسنس", "Mint license codes")} subtitle={L("کدها ۱۲ کاراکتری و تک‌مصرف هستند", "Codes are 12 characters and single-use")}>
					<div className="space-y-4">
						<div className="grid gap-3 md:grid-cols-4">
							<Field label={L("تعداد", "Count")}>
								<Input value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
							</Field>
							<Field label={L("پلن", "Plan")}>
								<Select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
									<option value="PRO">PRO</option>
									<option value="PLUS">PLUS</option>
									<option value="FREE">FREE</option>
								</Select>
							</Field>
							<Field label={L("اعتبار به روز (۰ = دائمی)", "Days (0 = perpetual)")}>
								<Input value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
							</Field>
							<Field label={L("یادداشت", "Note")}>
								<Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
							</Field>
						</div>
						<Button
							loading={busy === "create"}
							onClick={() =>
								void send(
									{
										create: {
											count: Math.max(1, Math.min(50, Number(form.count) || 1)),
											plan: form.plan,
											days: Math.max(0, Math.min(3650, Number(form.days) || 0)),
											note: form.note,
										},
									},
									"create",
								)
							}
						>
							{L("ساخت", "Create")}
						</Button>
						{made.length ? (
							<div className="tile space-y-1">
								{made.map((c) => (
									<div key={c} className="flex items-center gap-2">
										<span className="mono">{c}</span>
										<CopyBtn value={c} />
									</div>
								))}
							</div>
						) : null}
					</div>
				</Card>
			) : null}

			{data.isOwner ? (
				<Card title={L("کدهای صادرشده", "Issued codes")} actions={<Badge tone="muted">{data.licenses.length}</Badge>}>
					{data.licenses.length ? (
						<div className="space-y-2">
							{data.licenses.map((l) => (
								<div key={l.code} className="tile flex flex-wrap items-center gap-2">
									<span className="mono">{l.code}</span>
									<CopyBtn value={l.code} />
									<Badge tone={TONE[l.status]}>{statusText(l.status)}</Badge>
									<Badge tone="cyan">{l.plan}</Badge>
									<span className="text-muted">{l.days ? l.days + " " + L("روز", "days") : L("دائمی", "perpetual")}</span>
									{l.instanceId ? <span className="mono text-muted">{l.instanceUrl || l.instanceId}</span> : null}
									{l.note ? <span className="text-muted">{l.note}</span> : null}
									<span className="ms-auto flex flex-wrap gap-2">
										{l.instanceId ? (
											<Button size="sm" onClick={() => void send({ code: l.code, release: true }, "row")}>
												{L("آزادسازی", "Release")}
											</Button>
										) : null}
										<Button size="sm" onClick={() => void send({ code: l.code, revoked: !l.revoked }, "row")}>
											{l.revoked ? L("بازگردانی", "Restore") : L("لغو", "Revoke")}
										</Button>
										<Button
											size="sm"
											onClick={async () => {
												if (!(await confirm(t("confirm_delete")))) return
												await send({ code: l.code, remove: true }, "row")
											}}
										>
											<Trash2 size={14} />
										</Button>
									</span>
								</div>
							))}
						</div>
					) : (
						<Empty text={t("nothing_here")} />
					)}
				</Card>
			) : null}
		</div>
	)
}
