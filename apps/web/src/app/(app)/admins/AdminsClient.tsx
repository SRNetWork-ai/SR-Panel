"use client"

import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { KeyRound, Pencil, ShieldPlus, Trash2 } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import type { AdminDto, ServerDto } from "@/lib/dto"
import { formatBytes, formatDate, formatNumber, percent, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Progress, Switch, cx, useConfirm, useToast } from "@/components/ui"

type Access = { serverId: string; inboundIds: number[] }
type Form = { username: string; password: string; displayName: string; isActive: boolean; trafficQuotaGB: string; clientLimit: string; expiresAt: string; telegramId: string; serverAccess: Access[] }
const emptyForm: Form = { username: "", password: "", displayName: "", isActive: true, trafficQuotaGB: "", clientLimit: "", expiresAt: "", telegramId: "", serverAccess: [] }

export function AdminsClient({ initial, servers, selfId }: { initial: AdminDto[]; servers: ServerDto[]; selfId: string }) {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const router = useRouter()
	const [admins, setAdmins] = useState(initial)
	const [modal, setModal] = useState<"new" | AdminDto | null>(null)
	const [form, setForm] = useState<Form>(emptyForm)
	const [busy, setBusy] = useState(false)
	const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

	const openNew = () => { setForm(emptyForm); setModal("new") }
	const openEdit = (a: AdminDto) => {
		setForm({
			username: a.username,
			password: "",
			displayName: a.displayName ?? "",
			isActive: a.isActive,
			trafficQuotaGB: a.trafficQuota ? String(Math.round((a.trafficQuota / 1024 ** 3) * 100) / 100) : "",
			clientLimit: a.clientLimit ? String(a.clientLimit) : "",
			expiresAt: a.expiresAt ? a.expiresAt.slice(0, 10) : "",
			telegramId: a.telegramId ?? "",
			serverAccess: a.serverAccess ?? [],
		})
		setModal(a)
	}

	const toggleServer = (serverId: string) =>
		setForm((f) => ({ ...f, serverAccess: f.serverAccess.some((x) => x.serverId === serverId) ? f.serverAccess.filter((x) => x.serverId !== serverId) : [...f.serverAccess, { serverId, inboundIds: [] }] }))
	const toggleInbound = (serverId: string, inboundId: number) =>
		setForm((f) => ({
			...f,
			serverAccess: f.serverAccess.map((x) => (x.serverId !== serverId ? x : { ...x, inboundIds: x.inboundIds.includes(inboundId) ? x.inboundIds.filter((i) => i !== inboundId) : [...x.inboundIds, inboundId] })),
		}))

	const submit = async (e: FormEvent) => {
		e.preventDefault()
		setBusy(true)
		const json = {
			username: form.username.trim().toLowerCase(),
			password: form.password || undefined,
			displayName: form.displayName.trim() || null,
			isActive: form.isActive,
			trafficQuotaGB: form.trafficQuotaGB === "" ? null : Number(form.trafficQuotaGB),
			clientLimit: form.clientLimit === "" ? null : Number(form.clientLimit),
			expiresAt: form.expiresAt ? new Date(form.expiresAt + "T23:59:59").toISOString() : null,
			telegramId: form.telegramId.trim() || null,
			serverAccess: form.serverAccess,
		}
		try {
			if (modal === "new") {
				const a = await api<AdminDto>("/api/admins", { method: "POST", json })
				setAdmins((l) => [...l, a])
			} else if (modal) {
				const a = await api<AdminDto>(`/api/admins/${modal.id}`, { method: "PATCH", json })
				setAdmins((l) => l.map((x) => (x.id === a.id ? { ...x, ...a } : x)))
			}
			setModal(null)
			toast.ok(t("set_saved"))
			router.refresh()
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setBusy(false)
		}
	}

	const remove = async (a: AdminDto) => {
		if (!confirm(`${t("delete")} «${a.username}» — ${t("confirm_delete")}`)) return
		try {
			await api(`/api/admins/${a.id}`, { method: "DELETE" })
			setAdmins((l) => l.filter((x) => x.id !== a.id))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		}
	}

	return (
		<div>
			<PageHeader title={t("ad_title")} subtitle={t("ad_sub")} actions={<Button variant="primary" onClick={openNew}><ShieldPlus className="h-4 w-4" />{t("ad_add")}</Button>} />

			<Card bodyClassName="px-0 pb-0">
				{admins.length === 0 ? <Empty /> : (
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr>
									<th>{t("ad_username")}</th>
									<th>{t("status")}</th>
									<th className="min-w-44">{t("ad_quota")}</th>
									<th>{t("nav_clients")}</th>
									<th>{t("ad_servers")}</th>
									<th>{t("ad_expires")}</th>
									<th>{t("ad_last_login")}</th>
									<th className="text-end">{t("actions")}</th>
								</tr>
							</thead>
							<tbody>
								{admins.map((a) => {
									const quotaPct = a.trafficQuota ? percent(a.allocatedBytes ?? 0, a.trafficQuota) : 0
									return (
										<tr key={a.id} className={cx(!a.isActive && "opacity-60")}>
											<td>
												<div className="flex items-center gap-2">
													<span className="font-medium">{a.displayName || a.username}</span>
													<Badge tone={a.role === "OWNER" ? "violet" : "cyan"}>{a.role === "OWNER" ? t("owner") : t("admin")}</Badge>
													{a.totpEnabled && <KeyRound className="h-3.5 w-3.5 text-success" />}
												</div>
												<div className="mono text-[11px] text-muted">@{a.username}{a.telegramId ? ` • ${a.telegramId}` : ""}</div>
											</td>
											<td><Badge tone={a.isActive ? "success" : "muted"}>{a.isActive ? t("active") : t("inactive")}</Badge></td>
											<td>
												{a.role === "OWNER" ? <span className="text-xs text-muted">{t("unlimited")}</span> : (
													<>
														<div className="mb-1 flex justify-between text-[11px] text-muted"><span className="num">{formatBytes(a.allocatedBytes ?? 0)}</span><span className="num">{a.trafficQuota ? formatBytes(a.trafficQuota) : "∞"}</span></div>
														<Progress value={quotaPct} />
														<div className="mt-1 text-[10px] text-muted">{t("ad_used")}: <span className="num">{formatBytes(a.usedBytes ?? 0)}</span></div>
													</>
												)}
											</td>
											<td className="num">{formatNumber(a.clientCount ?? 0, locale)}{a.clientLimit ? ` / ${formatNumber(a.clientLimit, locale)}` : ""}</td>
											<td>
												{a.role === "OWNER" ? <span className="text-xs text-muted">{t("all")}</span> : (
													<div className="flex flex-wrap gap-1">
														{(a.serverAccess ?? []).length === 0 && <span className="text-xs text-muted">—</span>}
														{(a.serverAccess ?? []).map((x) => <Badge key={x.serverId} tone="cyan">{servers.find((s) => s.id === x.serverId)?.name ?? "?"}{x.inboundIds.length ? ` (${x.inboundIds.length})` : ""}</Badge>)}
													</div>
												)}
											</td>
											<td className="text-xs">{a.expiresAt ? formatDate(a.expiresAt, locale) : <span className="text-muted">{t("never")}</span>}</td>
											<td className="text-xs text-muted">{relativeTime(a.lastLoginAt, locale)}</td>
											<td>
												<div className="flex justify-end gap-1">
													<Button size="icon" variant="ghost" title={t("edit")} onClick={() => openEdit(a)} disabled={a.role === "OWNER" && a.id !== selfId}><Pencil className="h-4 w-4" /></Button>
													{a.role !== "OWNER" && <Button size="icon" variant="danger" title={t("delete")} onClick={() => remove(a)}><Trash2 className="h-4 w-4" /></Button>}
												</div>
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				)}
			</Card>

			<Modal open={modal !== null} onClose={() => setModal(null)} title={modal === "new" ? t("ad_add") : t("ad_edit")} wide footer={<Button variant="primary" type="submit" form="admin-form" loading={busy}>{modal === "new" ? t("create") : t("save")}</Button>}>
				<form id="admin-form" onSubmit={submit} className="grid gap-4 md:grid-cols-2">
					<div className="space-y-3">
						<div className="grid grid-cols-2 gap-3">
							<Field label={t("ad_username")}><Input className="mono text-start" value={form.username} onChange={(e) => set("username", e.target.value)} required pattern="[a-z0-9_.\-]{3,32}" disabled={modal !== "new" && modal?.role === "OWNER"} autoComplete="off" /></Field>
							<Field label={t("ad_password")} hint={modal !== "new" ? t("srv_pass_keep") : undefined}><Input className="mono text-start" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required={modal === "new"} minLength={8} autoComplete="new-password" /></Field>
						</div>
						<Field label={t("ad_display_name")}><Input value={form.displayName} onChange={(e) => set("displayName", e.target.value)} /></Field>
						<div className="grid grid-cols-2 gap-3">
							<Field label={t("ad_quota")} hint={t("ad_blank_unlimited")}><Input type="number" min={0} step="0.5" value={form.trafficQuotaGB} onChange={(e) => set("trafficQuotaGB", e.target.value)} placeholder="∞" /></Field>
							<Field label={t("ad_client_limit")} hint={t("ad_blank_unlimited")}><Input type="number" min={0} value={form.clientLimit} onChange={(e) => set("clientLimit", e.target.value)} placeholder="∞" /></Field>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<Field label={t("ad_expires")}><Input type="date" className="text-start" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} /></Field>
							<Field label={t("cl_telegram")}><Input className="mono text-start" value={form.telegramId} onChange={(e) => set("telegramId", e.target.value)} placeholder="@username" /></Field>
						</div>
						<Switch checked={form.isActive} onChange={(v) => set("isActive", v)} label={t("active")} />
					</div>

					<div className={cx(modal !== "new" && modal?.role === "OWNER" && "pointer-events-none opacity-50")}>
						<div className="label">{t("ad_server_access")}</div>
						<p className="mb-2 text-[11px] text-muted">{t("ad_server_access_hint")}</p>
						<div className="scrollbar-thin max-h-80 space-y-2 overflow-y-auto pe-1">
							{servers.length === 0 && <p className="text-xs text-muted">{t("srv_empty")}</p>}
							{servers.map((s) => {
								const acc = form.serverAccess.find((x) => x.serverId === s.id)
								return (
									<div key={s.id} className={cx("glass glass-2 p-3 transition", acc && "neon-ring")}>
										<Switch checked={!!acc} onChange={() => toggleServer(s.id)} label={s.name} />
										{acc && s.inbounds.length > 0 && (
											<div className="mt-2 flex flex-wrap gap-1.5">
												<span className="text-[10px] text-muted">{acc.inboundIds.length === 0 ? t("ad_all_inbounds") : ""}</span>
												{s.inbounds.map((i) => (
													<button key={i.id} type="button" onClick={() => toggleInbound(s.id, i.id)} className={cx("badge cursor-pointer", acc.inboundIds.includes(i.id) ? "badge-violet" : "badge-muted")}>{i.protocol}:{i.port}{i.remark ? ` • ${i.remark}` : ""}</button>
												))}
											</div>
										)}
									</div>
								)
							})}
						</div>
					</div>
				</form>
			</Modal>
		</div>
	)
}
