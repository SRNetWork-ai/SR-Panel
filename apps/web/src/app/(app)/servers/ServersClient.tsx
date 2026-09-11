"use client"

import { useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Cpu, HardDrive, KeyRound, Pencil, Plug, RefreshCw, Trash2, UserRound } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import type { ServerDto } from "@/lib/dto"
import { formatBytes, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Progress, StatusBadge, Switch, cx, useConfirm, useToast } from "@/components/ui"

/** Pointer-driven 3D tilt - writes the CSS vars that .tilt consumes (see motion3d.css). */
function Tilt({ children, max = 7 }: { children: ReactNode; max?: number }) {
	const ref = useRef<HTMLDivElement>(null)
	const move = (e: ReactPointerEvent<HTMLDivElement>) => {
		const el = ref.current
		if (!el || e.pointerType === "touch") return
		const r = el.getBoundingClientRect()
		const px = (e.clientX - r.left) / r.width - 0.5
		const py = (e.clientY - r.top) / r.height - 0.5
		el.style.setProperty("--ry", (px * max).toFixed(2) + "deg")
		el.style.setProperty("--rx", (-py * max).toFixed(2) + "deg")
		el.style.setProperty("--mx", (px * 100 + 50).toFixed(1) + "%")
		el.style.setProperty("--my", (py * 100 + 50).toFixed(1) + "%")
	}
	const reset = () => {
		const el = ref.current
		if (!el) return
		el.style.setProperty("--rx", "0deg")
		el.style.setProperty("--ry", "0deg")
	}
	return (
		<div ref={ref} className="tilt" onPointerMove={move} onPointerLeave={reset}>
			{children}
		</div>
	)
}

type AuthMode = "password" | "token"

type FormState = {
	name: string
	baseUrl: string
	authMode: AuthMode
	apiToken: string
	username: string
	password: string
	totpSecret: string
	twoFactorCode: string
	insecureTls: boolean
	publicHost: string
	subBaseUrl: string
	weight: number
	isActive: boolean
}

type InboundOption = {
	id: number
	remark: string
	protocol: string
	port: number
	enable: boolean
	tlsFlowCapable?: boolean
	ssMethod?: string
}

type Caps = {
	clientsApi: boolean
	inboundOptions: boolean
	bearerAuth: boolean
	twoFactor: boolean
	panelVersion?: string
	xrayVersion?: string
}

type TestResponse =
	| { ok?: false; error: string }
	| {
			ok: true
			baseUrl: string
			status: { xrayVersion?: string; panelVersion?: string; publicIp?: string }
			capabilities: Caps
			inbounds: InboundOption[]
	  }

const empty: FormState = {
	name: "",
	baseUrl: "",
	authMode: "token",
	apiToken: "",
	username: "",
	password: "",
	totpSecret: "",
	twoFactorCode: "",
	insecureTls: false,
	publicHost: "",
	subBaseUrl: "",
	weight: 100,
	isActive: true,
}

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
	const [result, setResult] = useState<TestResponse | null>(null)
	const [syncing, setSyncing] = useState<string | null>(null)

	/** the new 3X-UI v3 fields are panel-specific, so they live here instead of the shared dictionary */
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const isNew = editing === "new"

	const openNew = () => {
		setForm(empty)
		setResult(null)
		setEditing("new")
	}
	const openEdit = (s: ServerDto) => {
		setForm({
			...empty,
			name: s.name,
			baseUrl: s.baseUrl,
			authMode: s.authMode ?? "password",
			username: s.username ?? "",
			insecureTls: Boolean(s.insecureTls),
			publicHost: s.publicHost ?? "",
			subBaseUrl: s.subBaseUrl ?? "",
			weight: s.weight,
			isActive: s.isActive,
		})
		setResult(null)
		setEditing(s)
	}
	const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

	const payload = () => ({
		name: form.name.trim(),
		baseUrl: form.baseUrl.trim(),
		authMode: form.authMode,
		username: form.authMode === "password" ? form.username.trim() : undefined,
		password: form.authMode === "password" && form.password ? form.password : undefined,
		apiToken: form.authMode === "token" && form.apiToken ? form.apiToken.trim() : undefined,
		totpSecret: form.totpSecret.trim() || undefined,
		insecureTls: form.insecureTls,
		publicHost: form.publicHost.trim() || null,
		subBaseUrl: form.subBaseUrl.trim() || null,
		weight: Number(form.weight) || 0,
		isActive: form.isActive,
	})

	const test = async () => {
		setTesting(true)
		setResult(null)
		try {
			const p = payload()
			const r = await api<TestResponse>("/api/servers/test", {
				method: "POST",
				json: {
					baseUrl: p.baseUrl,
					authMode: p.authMode,
					username: p.username,
					password: p.password,
					apiToken: p.apiToken,
					totpSecret: p.totpSecret,
					twoFactorCode: form.twoFactorCode.trim() || undefined,
					insecureTls: p.insecureTls,
					serverId: editing && editing !== "new" ? editing.id : undefined,
				},
			})
			setResult(r)
			if (r && "baseUrl" in r && r.baseUrl && r.baseUrl !== form.baseUrl) set("baseUrl", r.baseUrl)
		} catch (err) {
			setResult({ error: err instanceof ApiError ? err.message : t("error_generic") })
		} finally {
			setTesting(false)
		}
	}

	const save = async (e: FormEvent) => {
		e.preventDefault()
		setBusy(true)
		try {
			if (isNew) {
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
		if (!confirm(t("srv_delete_warn") + "\\n\\n" + t("confirm_delete"))) return
		try {
			await api(`/api/servers/${s.id}`, { method: "DELETE" })
			setServers((l) => l.filter((x) => x.id !== s.id))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		}
	}

	const authSeg = (
		<div className="grid grid-cols-2 gap-2">
			<button type="button" onClick={() => set("authMode", "token")} className={cx("btn justify-center gap-2", form.authMode === "token" && "btn-primary")}>
				<KeyRound className="h-4 w-4" />
				{L("توکن API", "API token")}
			</button>
			<button type="button" onClick={() => set("authMode", "password")} className={cx("btn justify-center gap-2", form.authMode === "password" && "btn-primary")}>
				<UserRound className="h-4 w-4" />
				{L("کاربری و رمز", "User & pass")}
			</button>
		</div>
	)

	return (
		<div>
			<PageHeader title={t("srv_title")} subtitle={t("srv_sub")} actions={<Button variant="primary" onClick={openNew}><Plug className="h-4 w-4" />{t("srv_add")}</Button>} />

			{servers.length === 0 ? (
				<Card><Empty text={t("srv_empty")} action={<Button variant="primary" size="sm" onClick={openNew}>{t("srv_add")}</Button>} /></Card>
			) : (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{servers.map((s) => (
						<Tilt key={s.id}>
							<Card className={cx("sheen h-full", !s.isActive && "opacity-60")}>
								<div className="mb-3 flex items-start justify-between gap-2">
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<h3 className="truncate font-semibold">{s.name}</h3>
											{s.authMode === "token" && <Badge tone="cyan">API</Badge>}
											{s.panelVersion && <Badge tone="violet">v{s.panelVersion}</Badge>}
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
						</Tilt>
					))}
				</div>
			)}

			<Modal
				open={editing !== null}
				onClose={() => setEditing(null)}
				title={isNew ? t("srv_add") : t("srv_edit")}
				footer={
					<>
						<Button onClick={test} loading={testing}>{t("srv_test")}</Button>
						<Button variant="primary" form="server-form" type="submit" loading={busy}>{t("save")}</Button>
					</>
				}
			>
				<form id="server-form" onSubmit={save} className="space-y-3">
					<Field label={t("srv_name")}><Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="DE-1 Hetzner" /></Field>

					<Field label={t("srv_url")} hint={L("مسیر پایه (webBasePath) را هم بنویسید — مانند 1.2.3.4:2053/BoezMVwcHtkq", "Include the panel webBasePath, e.g. 1.2.3.4:2053/BoezMVwcHtkq")}>
						<Input className="mono text-start" value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} required placeholder="1.2.3.4:2053/BoezMVwcHtkq" />
					</Field>

					<Field label={L("روش احراز هویت", "Auth method")} hint={form.authMode === "token" ? L("در پنل: Settings → Security → API Token با دسترسی admin", "In the panel: Settings → Security → API Token (admin scope)") : L("همان کاربری و رمزی که باهاش داخل پنل می‌شوید", "The same credentials you use to log into the panel")}>
						{authSeg}
					</Field>

					{form.authMode === "token" ? (
						<Field label={L("توکن API پنل", "Panel API token")} hint={!isNew && (editing as ServerDto)?.hasApiToken ? t("srv_pass_keep") : undefined}>
							<Input className="mono text-start" type="password" value={form.apiToken} onChange={(e) => set("apiToken", e.target.value)} required={isNew} autoComplete="new-password" placeholder="3xui_xxxxxxxxxxxxxxxx" />
						</Field>
					) : (
						<>
							<div className="grid grid-cols-2 gap-3">
								<Field label={t("srv_user")}><Input className="mono text-start" value={form.username} onChange={(e) => set("username", e.target.value)} required autoComplete="off" /></Field>
								<Field label={t("srv_pass")} hint={!isNew ? t("srv_pass_keep") : undefined}><Input className="mono text-start" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required={isNew} autoComplete="new-password" /></Field>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<Field label={L("سکرت 2FA پنل (اختیاری)", "Panel 2FA secret (optional)")} hint={L("اگر ورود دومرحله‌ای فعال است", "If panel 2FA is enabled")}>
									<Input className="mono text-start" value={form.totpSecret} onChange={(e) => set("totpSecret", e.target.value)} autoComplete="off" placeholder="JBSWY3DPEHPK3PXP" />
								</Field>
								<Field label={L("کد یک‌بارمصرف (فقط تست)", "One-time code (test only)")}>
									<Input className="mono text-start" value={form.twoFactorCode} onChange={(e) => set("twoFactorCode", e.target.value)} inputMode="numeric" maxLength={8} placeholder="123456" />
								</Field>
							</div>
						</>
					)}

					<div className="grid grid-cols-2 gap-3">
						<Field label={t("srv_public_host")}><Input className="mono text-start" value={form.publicHost} onChange={(e) => set("publicHost", e.target.value)} placeholder="de1.example.com" /></Field>
						<Field label={L("آدرس ساب پنل (اختیاری)", "Panel subscription URL (optional)")}><Input className="mono text-start" value={form.subBaseUrl} onChange={(e) => set("subBaseUrl", e.target.value)} placeholder=":10882/sub/" /></Field>
					</div>

					<div className="grid grid-cols-2 items-end gap-3">
						<Field label={t("srv_weight")}><Input type="number" min={0} max={1000} value={form.weight} onChange={(e) => set("weight", Number(e.target.value))} /></Field>
						<div className="space-y-2 pb-2">
							<Switch checked={form.isActive} onChange={(v) => set("isActive", v)} label={t("active")} />
							<Switch checked={form.insecureTls} onChange={(v) => set("insecureTls", v)} label={L("پذیرش گواهی SSL نامعتبر", "Allow self-signed TLS")} />
						</div>
					</div>

					{result && ("ok" in result && result.ok ? (
						<div className="space-y-2 rounded-xl border border-success/30 bg-success/10 p-3 text-[11px]">
							<div className="flex flex-wrap items-center gap-1.5">
								<Badge tone="success">{t("srv_test_ok", { n: result.inbounds.length })}</Badge>
								{result.capabilities.panelVersion && <Badge tone="cyan">{L("نسخه پنل", "Panel")} {result.capabilities.panelVersion}</Badge>}
								{result.status.xrayVersion && <Badge tone="violet">Xray {result.status.xrayVersion}</Badge>}
							</div>
							<div className="flex flex-wrap gap-1.5">
								{result.capabilities.clientsApi ? <Badge tone="success">{L("API کلاینت‌ها v3", "Clients API v3")}</Badge> : <Badge tone="warning">{L("حالت سازگاری 2.x", "Legacy 2.x mode")}</Badge>}
								{result.capabilities.inboundOptions && <Badge tone="cyan">{L("لیست سریع اینباند", "Inbound options")}</Badge>}
								{result.capabilities.bearerAuth && <Badge tone="violet">{L("احراز با توکن", "Bearer auth")}</Badge>}
								{result.capabilities.twoFactor && <Badge tone="warning">{L("ورود دومرحله‌ای", "Two-factor")}</Badge>}
							</div>
							{result.inbounds.length > 0 && (
								<div>
									<div className="mb-1 text-muted">{L("اینباندهای قابل استفاده", "Usable inbounds")}</div>
									<div className="flex flex-wrap gap-1">
										{result.inbounds.slice(0, 12).map((i) => (
											<Badge key={i.id} tone={i.enable ? "violet" : "muted"}>{i.protocol} • {i.port}{i.remark ? ` • ${i.remark}` : ""}{i.tlsFlowCapable ? " • flow" : ""}{i.ssMethod ? ` • ${i.ssMethod}` : ""}</Badge>
										))}
										{result.inbounds.length > 12 && <Badge>+{result.inbounds.length - 12}</Badge>}
									</div>
								</div>
							)}
							<div className="mono text-[10px] text-muted">{result.baseUrl}</div>
						</div>
					) : (
						<div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-[11px] text-danger">{"error" in result ? result.error : t("error_generic")}</div>
					))}
				</form>
			</Modal>
		</div>
	)
}
