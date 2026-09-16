"use client"

import { useEffect, useState } from "react"
import { Check, Lock, RefreshCw, Trash2 } from "lucide-react"
import { api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Select, Spinner, useConfirm, useToast } from "@/components/ui"
import { CopyBtn } from "@/components/bits"
import { fmtWhen, tr } from "./types"

type Plan = "FREE" | "PLUS" | "PRO"
type Status = "unused" | "active" | "expired" | "revoked" | "free"

/** What this install is entitled to right now (see core/licenseVendor). */
type Panel = {
	vendor: boolean
	locked: boolean
	plan: Plan
	features: string[]
	status: Status
	code: string
	activatedAt: string
	expiresAt: string
	lastCheck: string
	source: string
	note: string
	grace: boolean
	graceDays: number
	instanceId: string
	api: string
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
	vendor: boolean
	panel: Panel
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

/**
 * Panel-wide premium. On a customer install this tab only activates a code the
 * vendor sold; minting and the issued-code list exist on the vendor panel only.
 */
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
			? L("\u0641\u0639\u0627\u0644", "Active")
			: s === "expired"
				? L("\u0645\u0646\u0642\u0636\u06cc", "Expired")
				: s === "revoked"
					? L("\u0644\u063a\u0648 \u0634\u062f\u0647", "Revoked")
					: s === "unused"
						? L("\u0627\u0633\u062a\u0641\u0627\u062f\u0647 \u0646\u0634\u062f\u0647", "Unused")
						: L("\u0628\u062f\u0648\u0646 \u0644\u0627\u06cc\u0633\u0646\u0633", "No license")

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
			toast.err(L("\u06a9\u062f \u0628\u0627\u06cc\u062f \u06f1\u06f2 \u06a9\u0627\u0631\u0627\u06a9\u062a\u0631 \u0628\u0627\u0634\u062f", "The code must be 12 characters"))
			return
		}
		await send({ activate: clean }, "activate", L("\u067e\u0631\u0645\u06cc\u0648\u0645 \u0641\u0639\u0627\u0644 \u0634\u062f", "Premium activated"))
		setCode("")
	}

	if (!data) return <Spinner />
	const p = data.panel
	const vendor = data.vendor
	const sourceText = p.source === "remote" ? L("\u0633\u0631\u0648\u0631 \u0644\u0627\u06cc\u0633\u0646\u0633", "License server") : L("\u0645\u062d\u0644\u06cc", "Local")

	return (
		<div className="space-y-6">
			<Card
				title={L("\u0644\u0627\u06cc\u0633\u0646\u0633 \u067e\u0646\u0644", "Panel license")}
				subtitle={
					vendor
						? L("\u067e\u0646\u0644 \u0641\u0631\u0648\u0634\u0646\u062f\u0647: \u06a9\u062f\u0647\u0627 \u0627\u0632 \u0647\u0645\u06cc\u0646 \u0646\u0635\u0628 \u0635\u0627\u062f\u0631 \u0645\u06cc\u200c\u0634\u0648\u0646\u062f", "Vendor panel: codes are issued from this install")
						: L("\u06cc\u06a9 \u06a9\u062f \u06f1\u06f2 \u06a9\u0627\u0631\u0627\u06a9\u062a\u0631\u06cc \u067e\u0631\u0645\u06cc\u0648\u0645 \u0631\u0627 \u0628\u0631\u0627\u06cc \u06a9\u0644 \u0627\u06cc\u0646 \u0646\u0635\u0628 \u0628\u0627\u0632 \u0645\u06cc\u200c\u06a9\u0646\u062f", "One 12-character code unlocks premium for this whole install")
				}
				actions={
					<span className="flex items-center gap-2">
						{vendor ? <Badge tone="violet">{L("\u062d\u0627\u0644\u062a \u0641\u0631\u0648\u0634\u0646\u062f\u0647", "Vendor mode")}</Badge> : null}
						<Badge tone={p.locked ? "warning" : TONE[p.status]}>{p.locked ? L("\u0642\u0641\u0644", "Locked") : statusText(p.status)}</Badge>
					</span>
				}
			>
				<div className="space-y-4">
					<div className="grid gap-3 md:grid-cols-3">
						<div className="tile">
							<div className="text-muted">{L("\u067e\u0644\u0646", "Plan")}</div>
							<div className="num">{p.plan}</div>
						</div>
						<div className="tile">
							<div className="text-muted">{L("\u0627\u0646\u0642\u0636\u0627", "Expiry")}</div>
							<div>{p.expiresAt ? fmtWhen(p.expiresAt, locale) : L("\u0628\u062f\u0648\u0646 \u0627\u0646\u0642\u0636\u0627", "Never")}</div>
						</div>
						<div className="tile">
							<div className="text-muted">{L("\u0622\u062e\u0631\u06cc\u0646 \u0628\u0627\u0632\u0628\u06cc\u0646\u06cc", "Last check")}</div>
							<div>{p.lastCheck ? fmtWhen(p.lastCheck, locale) : "-"}</div>
						</div>
					</div>

					<div className="tile space-y-2">
						<div className="text-muted">{L("\u0634\u0646\u0627\u0633\u0647\u0654 \u0646\u0635\u0628 \u2014 \u0627\u06cc\u0646 \u0631\u0627 \u0628\u0647 \u0641\u0631\u0648\u0634\u0646\u062f\u0647 \u0628\u062f\u0647\u06cc\u062f", "Install id \u2014 hand this to the vendor")}</div>
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
						{vendor ? null : (
							<div className="text-muted">
								{L("\u0633\u0631\u0648\u0631 \u0644\u0627\u06cc\u0633\u0646\u0633", "License server")}: <span className="mono">{p.api}</span>
							</div>
						)}
						{p.grace ? (
							<div className="text-cyan">
								{L("\u0628\u0627\u0632\u0628\u06cc\u0646\u06cc \u0628\u0627 \u0633\u0631\u0648\u0631 \u0644\u0627\u06cc\u0633\u0646\u0633 \u0628\u0647\u200c\u0631\u0648\u0632 \u0646\u06cc\u0633\u062a", "Verification with the license server is overdue")} ({p.graceDays}{" "}
								{L("\u0631\u0648\u0632 \u0645\u0647\u0644\u062a \u0622\u0641\u0644\u0627\u06cc\u0646", "days of offline grace")})
							</div>
						) : null}
						{p.locked ? (
							<div className="text-danger">
								{L("\u067e\u0631\u0645\u06cc\u0648\u0645 \u0642\u0641\u0644 \u0627\u0633\u062a\u061b \u06cc\u06a9 \u06a9\u062f \u0645\u0639\u062a\u0628\u0631 \u0641\u0639\u0627\u0644 \u06a9\u0646\u06cc\u062f", "Premium is locked \u2014 activate a valid code")}
							</div>
						) : null}
						{p.note ? <div className="text-danger">{p.note}</div> : null}
					</div>

					{data.isOwner ? (
						<div className="grid gap-3 md:grid-cols-2">
							<Field
								label={L("\u06a9\u062f \u0644\u0627\u06cc\u0633\u0646\u0633 (\u06f1\u06f2 \u06a9\u0627\u0631\u0627\u06a9\u062a\u0631)", "License code (12 chars)")}
								hint={L("\u06a9\u062f \u0631\u0627 \u0627\u0632 \u0641\u0631\u0648\u0634\u0646\u062f\u0647 \u0628\u06af\u06cc\u0631\u06cc\u062f", "Get the code from the vendor")}
							>
								<Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD2345EFGH" />
							</Field>
							<div className="flex flex-wrap items-end gap-2">
								<Button onClick={activate} loading={busy === "activate"}>
									{L("\u0641\u0639\u0627\u0644\u200c\u0633\u0627\u0632\u06cc \u067e\u0631\u0645\u06cc\u0648\u0645", "Activate premium")}
								</Button>
								{p.code ? (
									<>
										<Button onClick={() => void send({ refresh: true }, "refresh")} loading={busy === "refresh"}>
											<RefreshCw size={16} />
											{L("\u0628\u0627\u0632\u0628\u06cc\u0646\u06cc", "Re-check")}
										</Button>
										<Button
											loading={busy === "clear"}
											onClick={async () => {
												if (!(await confirm(L("\u0644\u0627\u06cc\u0633\u0646\u0633 \u0627\u06cc\u0646 \u067e\u0646\u0644 \u062d\u0630\u0641 \u0634\u0648\u062f\u061f", "Remove this panel license?")))) return
												await send({ clear: true }, "clear", L("\u0644\u0627\u06cc\u0633\u0646\u0633 \u062d\u0630\u0641 \u0634\u062f", "License removed"))
											}}
										>
											<Trash2 size={16} />
											{L("\u062d\u0630\u0641 \u0644\u0627\u06cc\u0633\u0646\u0633", "Remove")}
										</Button>
									</>
								) : null}
							</div>
						</div>
					) : null}

					<div>
						<div className="text-muted mb-2">{L("\u0642\u0627\u0628\u0644\u06cc\u062a\u200c\u0647\u0627\u06cc \u067e\u0631\u0645\u06cc\u0648\u0645", "Premium features")}</div>
						<div className="grid gap-2 md:grid-cols-3">
							{data.features.map((f) => {
								const on = vendor || p.features.includes(f.id)
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

			{vendor && data.isOwner ? (
				<Card
					title={L("\u0633\u0627\u062e\u062a \u06a9\u062f \u0644\u0627\u06cc\u0633\u0646\u0633", "Mint license codes")}
					subtitle={L("\u06a9\u062f\u0647\u0627 \u06f1\u06f2 \u06a9\u0627\u0631\u0627\u06a9\u062a\u0631\u06cc \u0648 \u062a\u06a9\u200c\u0645\u0635\u0631\u0641 \u0647\u0633\u062a\u0646\u062f", "Codes are 12 characters and single-use")}
				>
					<div className="space-y-4">
						<div className="grid gap-3 md:grid-cols-4">
							<Field label={L("\u062a\u0639\u062f\u0627\u062f", "Count")}>
								<Input value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
							</Field>
							<Field label={L("\u067e\u0644\u0646", "Plan")}>
								<Select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
									<option value="PRO">PRO</option>
									<option value="PLUS">PLUS</option>
									<option value="FREE">FREE</option>
								</Select>
							</Field>
							<Field label={L("\u0627\u0639\u062a\u0628\u0627\u0631 \u0628\u0647 \u0631\u0648\u0632 (\u06f0 = \u062f\u0627\u0626\u0645\u06cc)", "Days (0 = perpetual)")}>
								<Input value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
							</Field>
							<Field label={L("\u06cc\u0627\u062f\u062f\u0627\u0634\u062a", "Note")}>
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
							{L("\u0633\u0627\u062e\u062a", "Create")}
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

			{vendor && data.isOwner ? (
				<Card title={L("\u06a9\u062f\u0647\u0627\u06cc \u0635\u0627\u062f\u0631\u0634\u062f\u0647", "Issued codes")} actions={<Badge tone="muted">{data.licenses.length}</Badge>}>
					{data.licenses.length ? (
						<div className="space-y-2">
							{data.licenses.map((l) => (
								<div key={l.code} className="tile flex flex-wrap items-center gap-2">
									<span className="mono">{l.code}</span>
									<CopyBtn value={l.code} />
									<Badge tone={TONE[l.status]}>{statusText(l.status)}</Badge>
									<Badge tone="cyan">{l.plan}</Badge>
									<span className="text-muted">{l.days ? l.days + " " + L("\u0631\u0648\u0632", "days") : L("\u062f\u0627\u0626\u0645\u06cc", "perpetual")}</span>
									{l.instanceId ? <span className="mono text-muted">{l.instanceUrl || l.instanceId}</span> : null}
									{l.note ? <span className="text-muted">{l.note}</span> : null}
									<span className="ms-auto flex flex-wrap gap-2">
										{l.instanceId ? (
											<Button size="sm" onClick={() => void send({ code: l.code, release: true }, "row")}>
												{L("\u0622\u0632\u0627\u062f\u0633\u0627\u0632\u06cc", "Release")}
											</Button>
										) : null}
										<Button size="sm" onClick={() => void send({ code: l.code, revoked: !l.revoked }, "row")}>
											{l.revoked ? L("\u0628\u0627\u0632\u06af\u0631\u062f\u0627\u0646\u06cc", "Restore") : L("\u0644\u063a\u0648", "Revoke")}
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
