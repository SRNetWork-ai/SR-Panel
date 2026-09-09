"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Bell, Bot, Copy, KeyRound, Plus, Send, Trash2, Webhook as WebhookIcon, Zap } from "lucide-react"
import type { AdminDto } from "@/lib/dto"
import { api, copyText } from "@/lib/client"
import { formatDate } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Spinner, Switch, cx, useConfirm, useToast } from "@/components/ui"

/* ---------- types ---------- */
export type TelegramForm = {
	enabled: boolean
	botToken: string
	botTokenMasked: string
	hasToken: boolean
	chatId: string
	botEnabled: boolean
	notifyIncidents: boolean
	notifyBackups: boolean
	notifyExpiry: boolean
	notifyTraffic: boolean
	notifyLogins: boolean
	notifyClientsDirect: boolean
}
type ApiKeyRow = { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null; createdAt: string }
type WebhookRow = { id: string; url: string; secret: string; events: string[]; isActive: boolean; lastStatus: number | null; lastError: string | null; lastFiredAt: string | null; failCount: number; createdAt: string }
type NotificationRow = { id: string; at: string; channel: string; kind: string; targetId: string | null; adminId: string | null; ok: boolean; error: string | null }
type Tab = "telegram" | "apikeys" | "webhooks" | "notifications"

function errMsg(err: unknown, fallback: string) {
	return err instanceof Error ? err.message : fallback
}

/* ---------- Telegram ---------- */
function TelegramTab({ initial }: { initial: TelegramForm }) {
	const t = useT()
	const toast = useToast()
	const [form, setForm] = useState<TelegramForm>(initial)
	const [saving, setSaving] = useState(false)
	const [testing, setTesting] = useState(false)
	const [bot, setBot] = useState<{ username?: string } | null>(null)
	const set = <K extends keyof TelegramForm>(k: K, v: TelegramForm[K]) => setForm((f) => ({ ...f, [k]: v }))

	async function save(e: FormEvent) {
		e.preventDefault()
		setSaving(true)
		try {
			const { botTokenMasked: _m, hasToken: _h, ...body } = form
			const r = await api<TelegramForm>("/api/settings/telegram", { method: "PUT", json: body })
			setForm(r)
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setSaving(false)
		}
	}

	async function test() {
		setTesting(true)
		setBot(null)
		try {
			const r = await api<{ ok: boolean; error?: string; bot?: { username?: string }; sent?: { ok: boolean; error?: string } }>("/api/settings/telegram/test", {
				method: "POST",
				json: { botToken: form.botToken || undefined, chatId: form.chatId || undefined },
			})
			if (!r.ok) {
				toast.err(`${t("tg_test_fail")}: ${r.error ?? ""}`)
				return
			}
			setBot(r.bot ?? null)
			if (r.sent?.ok) toast.ok(t("tg_test_ok"))
			else toast.err(`${t("tg_bot_ok_no_msg")}: ${r.sent?.error ?? ""}`)
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setTesting(false)
		}
	}

	const toggles: Array<[keyof TelegramForm, string]> = [
		["notifyIncidents", t("tg_notify_incidents")],
		["notifyBackups", t("tg_notify_backups")],
		["notifyExpiry", t("tg_notify_expiry")],
		["notifyTraffic", t("tg_notify_traffic")],
		["notifyLogins", t("tg_notify_logins")],
		["notifyClientsDirect", t("tg_notify_clients_direct")],
	]

	return (
		<form onSubmit={save} className="grid gap-4 lg:grid-cols-2">
			<Card title={t("tg_title")} subtitle={t("tg_sub")}>
				<div className="space-y-4">
					<Switch checked={form.enabled} onChange={(v) => set("enabled", v)} label={t("tg_enabled")} />
					<Field label={t("tg_token")} hint={form.hasToken ? `${t("tg_token_saved")}: ${form.botTokenMasked}` : t("tg_token_hint")}>
						<Input type="password" dir="ltr" autoComplete="off" placeholder={form.hasToken ? "•••••••• (بدون تغییر)" : "123456789:AA..."} value={form.botToken} onChange={(e) => set("botToken", e.target.value)} />
					</Field>
					<Field label={t("tg_chat_id")} hint={t("tg_chat_hint")}>
						<Input dir="ltr" placeholder="-1001234567890" value={form.chatId} onChange={(e) => set("chatId", e.target.value)} />
					</Field>
					<Switch checked={form.botEnabled} onChange={(v) => set("botEnabled", v)} label={t("tg_bot_enabled")} />
					<div className="flex flex-wrap gap-2 pt-1">
						<Button type="submit" variant="primary" loading={saving}>{t("save")}</Button>
						<Button type="button" onClick={test} loading={testing}>
							<Send className="h-4 w-4" /> {t("tg_test")}
						</Button>
						{bot?.username && <Badge tone="success">@{bot.username}</Badge>}
					</div>
				</div>
			</Card>
			<Card title={t("tg_notifications")} subtitle={t("tg_notifications_sub")}>
				<div className="space-y-3">
					{toggles.map(([k, label]) => (
						<Switch key={k} checked={Boolean(form[k])} onChange={(v) => set(k, v as never)} label={label} />
					))}
				</div>
				<div className="glass-2 mt-5 rounded-xl p-3 text-xs leading-6 text-muted">
					<div className="mb-1 font-medium text-fg">{t("tg_commands")}</div>
					<code className="mono" dir="ltr">/status · /clients · /client &lt;name&gt; · /expiring · /incidents · /backup · /id</code>
					<div className="mt-1">{t("tg_commands_hint")}</div>
				</div>
			</Card>
		</form>
	)
}

/* ---------- API keys ---------- */
function ApiKeysTab() {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const [rows, setRows] = useState<ApiKeyRow[] | null>(null)
	const [open, setOpen] = useState(false)
	const [name, setName] = useState("")
	const [write, setWrite] = useState(false)
	const [creating, setCreating] = useState(false)
	const [plaintext, setPlaintext] = useState<string | null>(null)

	const load = useCallback(async () => setRows((await api<{ items: ApiKeyRow[] }>("/api/apikeys")).items), [])
	useEffect(() => {
		load().catch(() => setRows([]))
	}, [load])

	async function create(e: FormEvent) {
		e.preventDefault()
		setCreating(true)
		try {
			const r = await api<{ key: ApiKeyRow; plaintext: string }>("/api/apikeys", { method: "POST", json: { name, scopes: write ? ["read", "write"] : ["read"] } })
			setOpen(false)
			setName("")
			setWrite(false)
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

	const origin = typeof window !== "undefined" ? window.location.origin : "https://panel.example.com"

	return (
		<>
			<Card
				title={t("ak_title")}
				subtitle={t("ak_sub")}
				bodyClassName="px-0 pb-0"
				actions={
					<Button size="sm" variant="primary" onClick={() => setOpen(true)}>
						<Plus className="h-4 w-4" /> {t("ak_create")}
					</Button>
				}
			>
				{rows === null ? (
					<div className="flex justify-center p-8"><Spinner /></div>
				) : rows.length === 0 ? (
					<div className="px-5 pb-5"><Empty text={t("ak_empty")} /></div>
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr>
									<th>{t("ak_name")}</th>
									<th>{t("ak_prefix")}</th>
									<th>{t("ak_scopes")}</th>
									<th>{t("ak_last_used")}</th>
									<th>{t("created_at")}</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{rows.map((k) => (
									<tr key={k.id} className={cx(k.revokedAt && "opacity-50")}>
										<td className="font-medium">{k.name}{k.revokedAt && <Badge tone="muted" className="ms-2">{t("ak_revoked_badge")}</Badge>}</td>
										<td className="mono text-xs" dir="ltr">{k.prefix}…</td>
										<td className="space-x-1">{k.scopes.map((s) => <Badge key={s} tone={s === "write" ? "warning" : "cyan"}>{s}</Badge>)}</td>
										<td className="num whitespace-nowrap">{k.lastUsedAt ? formatDate(k.lastUsedAt, locale, true) : "—"}</td>
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
					<div className="mb-1 font-medium text-fg">{t("ak_curl_hint")}</div>
					<pre className="mono glass-2 overflow-x-auto rounded-xl p-3 leading-6" dir="ltr">{`curl -H "Authorization: Bearer srp_xxx" ${origin}/api/v1/clients?take=20
curl -X POST -H "Authorization: Bearer srp_xxx" -H "Content-Type: application/json" \\
  -d '{"name":"user1","trafficGB":50,"days":30,"targets":[{"serverId":"...","inboundId":1}]}' ${origin}/api/v1/clients
GET /api/v1/me · GET /api/v1/servers · GET|PATCH|DELETE /api/v1/clients/:id · POST /api/v1/clients/:id/reset`}</pre>
				</div>
			</Card>

			<Modal
				open={open}
				onClose={() => setOpen(false)}
				title={t("ak_create")}
				footer={
					<>
						<Button onClick={() => setOpen(false)}>{t("cancel")}</Button>
						<Button variant="primary" form="ak-form" type="submit" loading={creating} disabled={!name.trim()}>{t("ak_create")}</Button>
					</>
				}
			>
				<form id="ak-form" onSubmit={create} className="space-y-4">
					<Field label={t("ak_name")}>
						<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-bot" autoFocus />
					</Field>
					<Switch checked={write} onChange={setWrite} label={t("ak_scope_write")} />
					<p className="text-xs text-muted">{t("ak_scope_hint")}</p>
				</form>
			</Modal>

			<Modal open={plaintext !== null} onClose={() => setPlaintext(null)} title={t("ak_created_once")} footer={<Button variant="primary" onClick={() => setPlaintext(null)}>{t("close")}</Button>}>
				<p className="mb-3 text-sm text-muted">{t("ak_created_once_hint")}</p>
				<div className="flex items-center gap-2">
					<Input readOnly dir="ltr" className="mono" value={plaintext ?? ""} onFocus={(e) => e.currentTarget.select()} />
					<Button onClick={async () => { await copyText(plaintext ?? ""); toast.ok(t("copied")) }}>
						<Copy className="h-4 w-4" />
					</Button>
				</div>
			</Modal>
		</>
	)
}

/* ---------- Webhooks ---------- */
function WebhooksTab() {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const [rows, setRows] = useState<WebhookRow[] | null>(null)
	const [events, setEvents] = useState<string[]>([])
	const [editing, setEditing] = useState<Partial<WebhookRow> | null>(null)
	const [saving, setSaving] = useState(false)
	const [testingId, setTestingId] = useState<string | null>(null)
	const [secretFor, setSecretFor] = useState<WebhookRow | null>(null)

	const load = useCallback(async () => {
		const r = await api<{ items: WebhookRow[]; events: string[] }>("/api/webhooks")
		setRows(r.items)
		setEvents(r.events)
	}, [])
	useEffect(() => {
		load().catch(() => setRows([]))
	}, [load])

	async function save(e: FormEvent) {
		e.preventDefault()
		if (!editing) return
		setSaving(true)
		try {
			const body = { url: editing.url ?? "", events: editing.events ?? [], isActive: editing.isActive ?? true }
			if (editing.id) {
				await api(`/api/webhooks/${editing.id}`, { method: "PATCH", json: body })
			} else {
				const r = await api<{ webhook: WebhookRow }>("/api/webhooks", { method: "POST", json: body })
				setSecretFor(r.webhook)
			}
			setEditing(null)
			toast.ok(t("set_saved"))
			await load()
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setSaving(false)
		}
	}

	async function remove(w: WebhookRow) {
		if (!confirm(t("confirm_delete"))) return
		await api(`/api/webhooks/${w.id}`, { method: "DELETE" }).catch((err) => toast.err(errMsg(err, t("error_generic"))))
		await load()
	}

	async function test(w: WebhookRow) {
		setTestingId(w.id)
		try {
			const r = await api<{ status: number | null; error: string | null }>(`/api/webhooks/${w.id}/test`, { method: "POST" })
			if (r.status && r.status < 300) toast.ok(`${t("wh_test_ok")} (${r.status})`)
			else toast.err(`${t("wh_test_fail")}: ${r.error ?? r.status ?? ""}`)
			await load()
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setTestingId(null)
		}
	}

	function toggleEvent(ev: string) {
		if (!editing) return
		const cur = editing.events ?? []
		setEditing({ ...editing, events: cur.includes(ev) ? cur.filter((x) => x !== ev) : [...cur, ev] })
	}

	return (
		<>
			<Card
				title={t("wh_title")}
				subtitle={t("wh_sub")}
				bodyClassName="px-0 pb-0"
				actions={
					<Button size="sm" variant="primary" onClick={() => setEditing({ url: "", events: [], isActive: true })}>
						<Plus className="h-4 w-4" /> {t("wh_create")}
					</Button>
				}
			>
				{rows === null ? (
					<div className="flex justify-center p-8"><Spinner /></div>
				) : rows.length === 0 ? (
					<div className="px-5 pb-5"><Empty text={t("wh_empty")} /></div>
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr>
									<th>{t("wh_url")}</th>
									<th>{t("wh_events")}</th>
									<th>{t("wh_last_status")}</th>
									<th>{t("wh_active")}</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{rows.map((w) => (
									<tr key={w.id}>
										<td className="mono max-w-[280px] truncate text-xs" dir="ltr" title={w.url}>{w.url}</td>
										<td>{w.events.length === 0 ? <Badge tone="violet">{t("wh_all_events")}</Badge> : <Badge tone="cyan">{w.events.length}</Badge>}</td>
										<td className="text-xs">
											{w.lastStatus === null ? "—" : <Badge tone={w.lastStatus < 300 ? "success" : "danger"}>{w.lastStatus}</Badge>}
											{w.lastFiredAt && <span className="num ms-2 text-muted">{formatDate(w.lastFiredAt, locale, true)}</span>}
											{w.failCount > 0 && <span className="ms-2 text-danger">×{w.failCount}</span>}
										</td>
										<td><Badge tone={w.isActive ? "success" : "muted"}>{t(w.isActive ? "active" : "inactive")}</Badge></td>
										<td className="text-end whitespace-nowrap">
											<Button size="sm" variant="ghost" onClick={() => test(w)} loading={testingId === w.id} title={t("wh_test")}><Zap className="h-4 w-4" /></Button>
											<Button size="sm" variant="ghost" onClick={() => setSecretFor(w)} title={t("wh_secret")}><KeyRound className="h-4 w-4" /></Button>
											<Button size="sm" variant="ghost" onClick={() => setEditing(w)}>{t("edit")}</Button>
											<Button size="sm" variant="ghost" onClick={() => remove(w)}><Trash2 className="h-4 w-4 text-danger" /></Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
				<div className="border-t border-white/5 px-5 py-4 text-xs leading-6 text-muted">
					<div className="mb-1 font-medium text-fg">{t("wh_signature_hint")}</div>
					<code className="mono" dir="ltr">x-srp-event, x-srp-delivery, x-srp-signature: sha256=HMAC_SHA256(secret, rawBody)</code>
				</div>
			</Card>

			<Modal
				open={editing !== null}
				onClose={() => setEditing(null)}
				title={editing?.id ? t("wh_edit") : t("wh_create")}
				wide
				footer={
					<>
						<Button onClick={() => setEditing(null)}>{t("cancel")}</Button>
						<Button variant="primary" form="wh-form" type="submit" loading={saving}>{t("save")}</Button>
					</>
				}
			>
				{editing && (
					<form id="wh-form" onSubmit={save} className="space-y-4">
						<Field label={t("wh_url")}>
							<Input dir="ltr" type="url" required placeholder="https://example.com/hooks/srpanel" value={editing.url ?? ""} onChange={(e) => setEditing({ ...editing, url: e.target.value })} />
						</Field>
						<Switch checked={editing.isActive ?? true} onChange={(v) => setEditing({ ...editing, isActive: v })} label={t("wh_active")} />
						<Field label={t("wh_events")} hint={t("wh_events_hint")}>
							<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
								{events.map((ev) => {
									const on = (editing.events ?? []).includes(ev)
									return (
										<button type="button" key={ev} onClick={() => toggleEvent(ev)} className={cx("mono rounded-lg border px-2 py-1.5 text-start text-xs transition", on ? "border-violet/60 bg-violet/15 text-fg" : "border-white/10 text-muted hover:border-white/20")} dir="ltr">
											{ev}
										</button>
									)
								})}
							</div>
						</Field>
					</form>
				)}
			</Modal>

			<Modal open={secretFor !== null} onClose={() => setSecretFor(null)} title={t("wh_secret")} footer={<Button variant="primary" onClick={() => setSecretFor(null)}>{t("close")}</Button>}>
				<p className="mb-3 text-sm text-muted">{t("wh_secret_hint")}</p>
				<div className="flex items-center gap-2">
					<Input readOnly dir="ltr" className="mono" value={secretFor?.secret ?? ""} onFocus={(e) => e.currentTarget.select()} />
					<Button onClick={async () => { await copyText(secretFor?.secret ?? ""); toast.ok(t("copied")) }}><Copy className="h-4 w-4" /></Button>
				</div>
			</Modal>
		</>
	)
}

/* ---------- Notifications ---------- */
function NotificationsTab() {
	const t = useT()
	const locale = useLocale()
	const [rows, setRows] = useState<NotificationRow[] | null>(null)
	useEffect(() => {
		api<{ items: NotificationRow[] }>("/api/notifications").then((r) => setRows(r.items)).catch(() => setRows([]))
	}, [])
	return (
		<Card title={t("ntf_title")} subtitle={t("ntf_sub")} bodyClassName="px-0 pb-0">
			{rows === null ? (
				<div className="flex justify-center p-8"><Spinner /></div>
			) : rows.length === 0 ? (
				<div className="px-5 pb-5"><Empty text={t("ntf_empty")} /></div>
			) : (
				<div className="table-wrap">
					<table className="table">
						<thead>
							<tr>
								<th>{t("ntf_time")}</th>
								<th>{t("ntf_kind")}</th>
								<th>{t("ntf_target")}</th>
								<th>{t("ntf_result")}</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((n) => (
								<tr key={String(n.id)}>
									<td className="num whitespace-nowrap">{formatDate(n.at, locale, true)}</td>
									<td><Badge tone="violet">{n.kind}</Badge></td>
									<td className="mono text-xs text-muted">{n.targetId ?? "—"}</td>
									<td>{n.ok ? <Badge tone="success">OK</Badge> : <Badge tone="danger" className="max-w-[260px] truncate">{n.error ?? "FAILED"}</Badge>}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</Card>
	)
}

/* ---------- page ---------- */
export function IntegrationsClient({ me, telegram }: { me: AdminDto; telegram: TelegramForm | null }) {
	const t = useT()
	const isOwner = me.role === "OWNER"
	const tabs: Array<{ id: Tab; label: string; icon: typeof Bot; owner?: boolean }> = [
		{ id: "telegram", label: t("int_tab_telegram"), icon: Bot, owner: true },
		{ id: "apikeys", label: t("int_tab_apikeys"), icon: KeyRound },
		{ id: "webhooks", label: t("int_tab_webhooks"), icon: WebhookIcon },
		{ id: "notifications", label: t("int_tab_notifications"), icon: Bell, owner: true },
	].filter((x) => isOwner || !x.owner)
	const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? "apikeys")

	return (
		<div className="space-y-6 fade-up">
			<PageHeader title={t("int_title")} subtitle={t("int_sub")} />
			<div className="glass flex flex-wrap gap-1 rounded-2xl p-1.5">
				{tabs.map((x) => (
					<button key={x.id} type="button" onClick={() => setTab(x.id)} className={cx("flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition", tab === x.id ? "bg-violet/20 text-fg neon-ring" : "text-muted hover:text-fg")}>
						<x.icon className="h-4 w-4" /> {x.label}
					</button>
				))}
			</div>
			{tab === "telegram" && telegram && <TelegramTab initial={telegram} />}
			{tab === "apikeys" && <ApiKeysTab />}
			{tab === "webhooks" && <WebhooksTab />}
			{tab === "notifications" && <NotificationsTab />}
		</div>
	)
}
