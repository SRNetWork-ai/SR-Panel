"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { Activity, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"
import { api } from "@/lib/client"
import { formatDate, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Switch, cx, useConfirm, useToast } from "@/components/ui"
import { CopyBtn, MiniStat } from "@/components/bits"
import { EXPIRY_CHOICES, errMsg, expiryIso, keyState, tr, type ApiKeyRow } from "./types"

type Filter = "all" | "active" | "revoked"

export function ApiKeysTab() {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const L = (fa: string, en: string) => tr(locale, fa, en)

	const [rows, setRows] = useState<ApiKeyRow[] | null>(null)
	const [filter, setFilter] = useState<Filter>("all")
	const [q, setQ] = useState("")
	const [busy, setBusy] = useState(false)
	const [open, setOpen] = useState(false)
	const [name, setName] = useState("")
	const [write, setWrite] = useState(false)
	const [days, setDays] = useState(0)
	const [creating, setCreating] = useState(false)
	const [plaintext, setPlaintext] = useState<string | null>(null)

	const load = useCallback(async () => setRows((await api<{ items: ApiKeyRow[] }>("/api/apikeys")).items), [])
	useEffect(() => {
		load().catch(() => setRows([]))
	}, [load])

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

	async function create(e: FormEvent) {
		e.preventDefault()
		setCreating(true)
		try {
			const r = await api<{ key: ApiKeyRow; plaintext: string }>("/api/apikeys", {
				method: "POST",
				json: { name: name.trim(), scopes: write ? ["read", "write"] : ["read"], expiresAt: expiryIso(days) },
			})
			setOpen(false)
			setName("")
			setWrite(false)
			setDays(0)
			setPlaintext(r.plaintext)
			await load()
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setCreating(false)
		}
	}

	async function revoke(k: ApiKeyRow) {
		if (!confirm(t("ak_revoke_confirm"))) return
		try {
			await api(`/api/apikeys/${k.id}`, { method: "DELETE" })
			toast.ok(t("ak_revoked"))
			await load()
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		}
	}

	const stats = useMemo(() => {
		const all = rows ?? []
		return {
			total: all.length,
			active: all.filter((k) => keyState(k) === "active").length,
			dead: all.filter((k) => keyState(k) !== "active").length,
			used: all.filter((k) => k.lastUsedAt).length,
		}
	}, [rows])

	const shown = useMemo(() => {
		const needle = q.trim().toLowerCase()
		return (rows ?? []).filter((k) => {
			const st = keyState(k)
			if (filter === "active" && st !== "active") return false
			if (filter === "revoked" && st === "active") return false
			if (!needle) return true
			return k.name.toLowerCase().includes(needle) || k.prefix.toLowerCase().includes(needle)
		})
	}, [rows, filter, q])

	const origin = typeof window !== "undefined" ? window.location.origin : "https://panel.example.com"
	const snippet = `curl -H "Authorization: Bearer srp_xxx" ${origin}/api/v1/clients?take=20\ncurl -X POST -H "Authorization: Bearer srp_xxx" -H "Content-Type: application/json" \\\n  -d '{"name":"user1","trafficGB":50,"days":30,"targets":[{"serverId":"...","inboundId":1}]}' ${origin}/api/v1/clients\nGET /api/v1/me · GET /api/v1/servers · GET|PATCH|DELETE /api/v1/clients/:id · POST /api/v1/clients/:id/reset`

	function stateBadge(k: ApiKeyRow) {
		const st = keyState(k)
		if (st === "revoked") return <Badge tone="muted">{t("ak_revoked_badge")}</Badge>
		if (st === "expired") return <Badge tone="warning">{L("منقضی شده", "Expired")}</Badge>
		return <Badge tone="success">{t("active")}</Badge>
	}

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MiniStat icon={<KeyRound className="h-4 w-4" />} label={L("کل کلیدها", "Total keys")} value={stats.total} tone="violet" />
				<MiniStat icon={<ShieldCheck className="h-4 w-4" />} label={t("active")} value={stats.active} tone="success" />
				<MiniStat icon={<Trash2 className="h-4 w-4" />} label={L("لغو/منقضی", "Revoked/expired")} value={stats.dead} tone="danger" />
				<MiniStat icon={<Activity className="h-4 w-4" />} label={L("دارای مصرف", "Used at least once")} value={stats.used} tone="cyan" />
			</div>

			<Card
				title={t("ak_title")}
				subtitle={t("ak_sub")}
				bodyClassName="px-0 pb-0"
				actions={
					<div className="flex flex-wrap gap-2">
						<Button size="sm" onClick={refresh} loading={busy} title={t("refresh")}>
							<RefreshCw className="h-4 w-4" />
						</Button>
						<Button size="sm" variant="primary" onClick={() => setOpen(true)}>
							<Plus className="h-4 w-4" /> {t("ak_create")}
						</Button>
					</div>
				}
			>
				<div className="flex flex-wrap items-center gap-2 px-5 pb-4">
					<Input className="w-56" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
					<div className="flex flex-wrap gap-1">
						{(["all", "active", "revoked"] as Filter[]).map((f) => (
							<button key={f} type="button" onClick={() => setFilter(f)} className={cx("chip", filter === f && "chip-on")}>
								{f === "all" ? t("all") : f === "active" ? t("active") : L("لغو/منقضی", "Revoked/expired")}
							</button>
						))}
					</div>
				</div>

				{rows === null ? (
					<div className="flex justify-center p-8"><Spinner /></div>
				) : shown.length === 0 ? (
					<div className="px-5 pb-5"><Empty text={rows.length === 0 ? t("ak_empty") : t("nothing_here")} /></div>
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr>
									<th>{t("ak_name")}</th>
									<th>{t("ak_prefix")}</th>
									<th>{t("ak_scopes")}</th>
									<th>{t("status")}</th>
									<th>{t("ak_last_used")}</th>
									<th>{L("انقضا", "Expires")}</th>
									<th>{t("created_at")}</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{shown.map((k) => (
									<tr key={k.id} className={cx(keyState(k) !== "active" && "opacity-60")}>
										<td className="font-medium">{k.name}</td>
										<td className="mono text-xs" dir="ltr">{k.prefix}…</td>
										<td className="space-x-1">
											{k.scopes.map((s) => (
												<Badge key={s} tone={s === "write" ? "warning" : "cyan"}>{s}</Badge>
											))}
										</td>
										<td>{stateBadge(k)}</td>
										<td className="whitespace-nowrap text-xs text-muted">{k.lastUsedAt ? relativeTime(k.lastUsedAt, locale) : t("never")}</td>
										<td className="num whitespace-nowrap">{k.expiresAt ? formatDate(k.expiresAt, locale) : t("never")}</td>
										<td className="num whitespace-nowrap">{formatDate(k.createdAt, locale)}</td>
										<td className="text-end">
											{!k.revokedAt && (
												<Button size="sm" variant="ghost" onClick={() => revoke(k)}>
													<Trash2 className="h-4 w-4 text-danger" /> {t("ak_revoke")}
												</Button>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				<div className="border-t border-white/5 px-5 py-4 text-xs text-muted">
					<div className="mb-2 flex flex-wrap items-center gap-3">
						<span className="font-medium text-fg">{t("ak_curl_hint")}</span>
						<CopyBtn value={snippet} label={L("کپی نمونه", "Copy sample")} />
					</div>
					<pre className="mono glass-2 scrollbar-thin overflow-x-auto rounded-xl p-3 leading-6" dir="ltr">{snippet}</pre>
				</div>
			</Card>

			<Modal
				open={open}
				onClose={() => setOpen(false)}
				title={t("ak_create")}
				footer={
					<>
						<Button type="button" onClick={() => setOpen(false)}>{t("cancel")}</Button>
						<Button variant="primary" form="ak-form" type="submit" loading={creating} disabled={!name.trim()}>{t("ak_create")}</Button>
					</>
				}
			>
				<form id="ak-form" onSubmit={create} className="space-y-4">
					<Field label={t("ak_name")} hint={L("برای شناسایی مصرف‌کننده (مانند ربات یا سایت)", "Identifies the consumer (bot, site, …)")}>
						<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-bot" autoFocus />
					</Field>
					<div className="tile p-3">
						<Switch checked={write} onChange={setWrite} label={t("ak_scope_write")} />
						<div className="mt-1 text-xs text-muted">{t("ak_scope_hint")}</div>
					</div>
					<Field label={L("انقضای خودکار", "Auto expiry")} hint={L("پس از این مدت، کلید خودبه‌خود از کار می‌افتد.", "The key stops working after this period.")}>
						<Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
							{EXPIRY_CHOICES.map((d) => (
								<option key={d} value={d}>{d === 0 ? t("never") : L(`${d} روز`, `${d} days`)}</option>
							))}
						</Select>
					</Field>
				</form>
			</Modal>

			<Modal
				open={plaintext !== null}
				onClose={() => setPlaintext(null)}
				title={t("ak_created_once")}
				footer={<Button variant="primary" onClick={() => setPlaintext(null)}>{t("close")}</Button>}
			>
				<p className="mb-3 text-sm text-muted">{t("ak_created_once_hint")}</p>
				<div className="flex items-center gap-2">
					<Input readOnly dir="ltr" className="mono flex-1" value={plaintext ?? ""} onFocus={(e) => e.currentTarget.select()} />
					<CopyBtn value={plaintext ?? ""} />
				</div>
			</Modal>
		</div>
	)
}
