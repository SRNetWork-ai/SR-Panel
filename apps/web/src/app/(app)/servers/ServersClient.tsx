"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Cpu, HardDrive, Pencil, Plug, RefreshCw, Trash2 } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import type { ServerDto } from "@/lib/dto"
import { formatBytes, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Progress, StatusBadge, Switch, useConfirm, useToast } from "@/components/ui"

type FormState = { name: string; baseUrl: string; username: string; password: string; publicHost: string; subBaseUrl: string; weight: number; isActive: boolean }
const empty: FormState = { name: "", baseUrl: "", username: "", password: "", publicHost: "", subBaseUrl: "", weight: 100, isActive: true }

export function ServersClient({ initial }: { initial: ServerDto[] }) {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const router = useRouter()
	const [servers, setServers] = useState(initial)
	const [editing, setEditing] = useState<ServerDto | null | "new">(null)
	const [form, setForm] = useState<FormState>(empty)
	const [busy, setBusy] = useState(false)
	const [testing, setTesting] = useState(false)
	const [testResult, setTestResult] = useState<string | null>(null)
	const [syncing, setSyncing] = useState<string | null>(null)

	const openNew = () => { setForm(empty); setTestResult(null); setEditing("new") }
	const openEdit = (s: ServerDto) => {
		setForm({ name: s.name, baseUrl: s.baseUrl, username: s.username, password: "", publicHost: s.publicHost ?? "", subBaseUrl: s.subBaseUrl ?? "", weight: s.weight, isActive: s.isActive })
		setTestResult(null)
		setEditing(s)
	}
	const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

	const payload = () => ({
		name: form.name.trim(),
		baseUrl: form.baseUrl.trim().replace(/\/+$/, ""),
		username: form.username.trim(),
		password: form.password || undefined,
		publicHost: form.publicHost.trim() || null,
		subBaseUrl: form.subBaseUrl.trim() || null,
		weight: Number(form.weight) || 0,
		isActive: form.isActive,
	})

	const test = async () => {
		setTesting(true)
		setTestResult(null)
		try {
			const r = await api<{ ok?: false; error?: string; inbounds?: unknown[]; status?: { xrayVersion?: string } }>("/api/servers/test", {
				method: "POST",
				json: { baseUrl: payload().baseUrl, username: payload().username, password: form.password || undefined, serverId: editing && editing !== "new" ? editing.id : undefined },
			})
			if (r.ok === false) setTestResult("❌ " + r.error)
			else setTestResult("✅ " + t("srv_test_ok", { n: r.inbounds?.length ?? 0 }) + (r.status?.xrayVersion ? ` • Xray ${r.status.xrayVersion}` : ""))
		} catch (err) {
			setTestResult("❌ " + (err instanceof ApiError ? err.message : t("error_generic")))
		} finally {
			setTesting(false)
		}
	}

	const save = async (e: FormEvent) => {
		e.preventDefault()
		setBusy(true)
		try {
			if (editing === "new") {
				const s = await api<ServerDto>("/api/servers", { method: "POST", json: payload() })
				setServers((l) => [s, ...l])
			} else if (editing) {
				const s = await api<ServerDto>(`/api/servers/${editing.id}`, { method: "PATCH", json: payload() })
				setServers((l) => l.map((x) => (x.id === s.id ? { ...x, ...s } : x)))
			}
			setEditing(null)
			toast.ok(t("set_saved"))
			setTimeout(() => router.refresh(), 2500)
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setBusy(false)
		}
	}

	const sync = async (s: ServerDto) => {
		setSyncing(s.id)
		try {
			const r = await api<{ ok: boolean; inbounds?: number; error?: string; server: ServerDto }>(`/api/servers/${s.id}/sync`, { method: "POST" })
			setServers((l) => l.map((x) => (x.id === s.id ? { ...r.server, clientCount: x.clientCount } : x)))
			if (r.ok) toast.ok(t("srv_test_ok", { n: r.inbounds ?? 0 }))
			else toast.err(r.error || t("error_generic"))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setSyncing(null)
		}
	}

	const remove = async (s: ServerDto) => {
		if (!confirm(t("srv_delete_warn") + "\n\n" + t("confirm_delete"))) return
		try {
			await api(`/api/servers/${s.id}`, { method: "DELETE" })
			setServers((l) => l.filter((x) => x.id !== s.id))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		}
	}

	return (
		<div>
			<PageHeader title={t("srv_title")} subtitle={t("srv_sub")} actions={<Button variant="primary" onClick={openNew}><Plug className="h-4 w-4" />{t("srv_add")}</Button>} />

			{servers.length === 0 ? (
				<Card><Empty text={t("srv_empty")} action={<Button variant="primary" size="sm" onClick={openNew}>{t("srv_add")}</Button>} /></Card>
			) : (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{servers.map((s) => (
						<Card key={s.id} className={!s.isActive ? "opacity-60" : ""}>
							<div className="mb-3 flex items-start justify-between gap-2">
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<h3 className="truncate font-semibold">{s.name}</h3>
										{!s.isActive && <Badge>{t("inactive")}</Badge>}
									</div>
									<div className="mono truncate text-[11px] text-muted">{s.baseUrl}</div>
								</div>
								<StatusBadge status={s.status} />
							</div>

							<div className="mb-3 grid grid-cols-2 gap-3 text-[11px] text-muted">
								<div>
									<div className="mb-0.5 flex items-center justify-between"><span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{t("cpu")}</span><span className="num">{s.stats?.cpu != null ? `${Math.round(s.stats.cpu)}%` : "—"}</span></div>
									<Progress value={s.stats?.cpu ?? 0} />
								</div>
								<div>
									<div className="mb-0.5 flex items-center justify-between"><span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{t("memory")}</span><span className="num">{s.stats?.memPct != null ? `${s.stats.memPct}%` : "—"}</span></div>
									<Progress value={s.stats?.memPct ?? 0} />
								</div>
							</div>

							<dl className="mb-3 grid grid-cols-3 gap-2 text-center text-[11px]">
								<div className="glass glass-2 p-2"><dt className="text-muted">{t("srv_inbounds")}</dt><dd className="num font-semibold">{s.inbounds.length}</dd></div>
								<div className="glass glass-2 p-2"><dt className="text-muted">{t("nav_clients")}</dt><dd className="num font-semibold">{s.clientCount ?? 0}</dd></div>
								<div className="glass glass-2 p-2"><dt className="text-muted">Xray</dt><dd className="num truncate font-semibold">{s.stats?.xrayVersion ?? "—"}</dd></div>
							</dl>

							{s.inbounds.length > 0 && (
								<div className="mb-3 flex flex-wrap gap-1">
									{s.inbounds.slice(0, 6).map((i) => (
										<Badge key={i.id} tone={i.enable ? "violet" : "muted"}>{i.protocol} • {i.port}{i.remark ? ` • ${i.remark}` : ""}</Badge>
									))}
									{s.inbounds.length > 6 && <Badge>+{s.inbounds.length - 6}</Badge>}
								</div>
							)}

							{s.lastError && <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger">{t("last_error")}: {s.lastError}</div>}

							<div className="flex items-center justify-between gap-2">
								<span className="text-[11px] text-muted">{t("last_seen")}: {relativeTime(s.lastSeenAt, locale)}{s.stats ? ` • ↑${formatBytes(s.stats.netUp, 0)} ↓${formatBytes(s.stats.netDown, 0)}` : ""}</span>
								<div className="flex gap-1">
									<Button size="icon" title={t("srv_sync")} onClick={() => sync(s)} loading={syncing === s.id}>{syncing !== s.id && <RefreshCw className="h-4 w-4" />}</Button>
									<Button size="icon" title={t("edit")} onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
									<Button size="icon" variant="danger" title={t("delete")} onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></Button>
								</div>
							</div>
						</Card>
					))}
				</div>
			)}

			<Modal
				open={editing !== null}
				onClose={() => setEditing(null)}
				title={editing === "new" ? t("srv_add") : t("srv_edit")}
				footer={
					<>
						<Button onClick={test} loading={testing}>{t("srv_test")}</Button>
						<Button variant="primary" form="server-form" type="submit" loading={busy}>{t("save")}</Button>
					</>
				}
			>
				<form id="server-form" onSubmit={save} className="space-y-3">
					<Field label={t("srv_name")}><Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="DE-1 Hetzner" /></Field>
					<Field label={t("srv_url")}><Input className="mono text-start" value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} required placeholder="https://1.2.3.4:2053/xyzpath" /></Field>
					<div className="grid grid-cols-2 gap-3">
						<Field label={t("srv_user")}><Input className="mono text-start" value={form.username} onChange={(e) => set("username", e.target.value)} required autoComplete="off" /></Field>
						<Field label={t("srv_pass")} hint={editing !== "new" ? t("srv_pass_keep") : undefined}><Input className="mono text-start" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required={editing === "new"} autoComplete="new-password" /></Field>
					</div>
					<Field label={t("srv_public_host")}><Input className="mono text-start" value={form.publicHost} onChange={(e) => set("publicHost", e.target.value)} placeholder="de1.example.com" /></Field>
					<div className="grid grid-cols-2 items-end gap-3">
						<Field label={t("srv_weight")}><Input type="number" min={0} max={1000} value={form.weight} onChange={(e) => set("weight", Number(e.target.value))} /></Field>
						<div className="pb-2"><Switch checked={form.isActive} onChange={(v) => set("isActive", v)} label={t("active")} /></div>
					</div>
					{testResult && <div className="rounded-xl border px-3 py-2 text-xs">{testResult}</div>}
				</form>
			</Modal>
		</div>
	)
}
