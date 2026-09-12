"use client"

import { useEffect, useState, type FormEvent } from "react"
import { KeyRound, Plug, ShieldCheck, Sliders, UserRound } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import type { ServerDto } from "@/lib/dto"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Field, Input, Modal, SubHead, Switch, cx, useToast } from "@/components/ui"
import { emptyForm, tr, type FormState, type TestResponse } from "./types"

export function ServerFormModal({
	editing,
	onClose,
	onSaved,
}: {
	editing: ServerDto | "new" | null
	onClose: () => void
	onSaved: (server: ServerDto, isNew: boolean) => void
}) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [form, setForm] = useState<FormState>(emptyForm)
	const [busy, setBusy] = useState(false)
	const [testing, setTesting] = useState(false)
	const [result, setResult] = useState<TestResponse | null>(null)
	const isNew = editing === "new"

	useEffect(() => {
		setResult(null)
		if (!editing) return
		if (editing === "new") {
			setForm(emptyForm)
			return
		}
		setForm({
			...emptyForm,
			name: editing.name,
			baseUrl: editing.baseUrl,
			authMode: editing.authMode ?? "password",
			username: editing.username ?? "",
			insecureTls: Boolean(editing.insecureTls),
			publicHost: editing.publicHost ?? "",
			subBaseUrl: editing.subBaseUrl ?? "",
			weight: editing.weight,
			isActive: editing.isActive,
		})
	}, [editing])

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

	async function test() {
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

	async function save(e: FormEvent) {
		e.preventDefault()
		setBusy(true)
		try {
			if (isNew) {
				const s = await api<ServerDto>("/api/servers", { method: "POST", json: payload() })
				onSaved(s, true)
			} else if (editing) {
				const s = await api<ServerDto>(`/api/servers/${editing.id}`, { method: "PATCH", json: payload() })
				onSaved(s, false)
			}
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setBusy(false)
		}
	}

	return (
		<Modal
			open={editing !== null}
			onClose={onClose}
			title={isNew ? t("srv_add") : t("srv_edit")}
			subtitle={!isNew && editing && editing !== "new" ? editing.baseUrl : L("اتصال پنل x-ui / 3x-ui", "Connect an x-ui / 3x-ui panel")}
			size="lg"
			footer={
				<>
					<Button type="button" onClick={test} loading={testing}><Plug className="h-4 w-4" /> {t("srv_test")}</Button>
					<Button type="submit" form="server-form" variant="primary" loading={busy}>{t("save")}</Button>
				</>
			}
		>
			<form id="server-form" onSubmit={save} className="space-y-5">
				<section>
					<SubHead title={L("اتصال", "Connection")} hint={L("مسیر پایه (webBasePath) را هم بنویسید", "Include the panel webBasePath")} />
					<div className="space-y-3">
						<Field label={t("srv_name")}><Input value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="DE-1 Hetzner" /></Field>
						<Field label={t("srv_url")} hint={L("مانند 1.2.3.4:2053/BoezMVwcHtkq", "e.g. 1.2.3.4:2053/BoezMVwcHtkq")}>
							<Input className="mono text-start" value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} required placeholder="1.2.3.4:2053/BoezMVwcHtkq" />
						</Field>
					</div>
				</section>

				<section>
					<SubHead
						title={L("احراز هویت", "Authentication")}
						hint={form.authMode === "token" ? L("در پنل: Settings → Security → API Token با دسترسی admin", "In the panel: Settings → Security → API Token (admin scope)") : L("همان کاربری و رمزی که باهاش داخل پنل می‌شوید", "The same credentials you use to log into the panel")}
					/>
					<div className="space-y-3">
						<div className="seg">
							<button type="button" onClick={() => set("authMode", "token")} className={cx("seg-item", form.authMode === "token" && "active")}>
								<KeyRound className="h-4 w-4" /> {L("توکن API", "API token")}
							</button>
							<button type="button" onClick={() => set("authMode", "password")} className={cx("seg-item", form.authMode === "password" && "active")}>
								<UserRound className="h-4 w-4" /> {L("کاربری و رمز", "User & pass")}
							</button>
						</div>

						{form.authMode === "token" ? (
							<Field label={L("توکن API پنل", "Panel API token")} hint={!isNew && editing && editing !== "new" && editing.hasApiToken ? t("srv_pass_keep") : undefined}>
								<Input className="mono text-start" type="password" value={form.apiToken} onChange={(e) => set("apiToken", e.target.value)} required={isNew} autoComplete="new-password" placeholder="3xui_xxxxxxxxxxxxxxxx" />
							</Field>
						) : (
							<>
								<div className="grid gap-3 sm:grid-cols-2">
									<Field label={t("srv_user")}><Input className="mono text-start" value={form.username} onChange={(e) => set("username", e.target.value)} required autoComplete="off" /></Field>
									<Field label={t("srv_pass")} hint={!isNew ? t("srv_pass_keep") : undefined}><Input className="mono text-start" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required={isNew} autoComplete="new-password" /></Field>
								</div>
								<div className="grid gap-3 sm:grid-cols-2">
									<Field label={L("سکرت 2FA پنل (اختیاری)", "Panel 2FA secret (optional)")} hint={L("اگر ورود دومرحله‌ای فعال است", "If panel 2FA is enabled")}>
										<Input className="mono text-start" value={form.totpSecret} onChange={(e) => set("totpSecret", e.target.value)} autoComplete="off" placeholder="JBSWY3DPEHPK3PXP" />
									</Field>
									<Field label={L("کد یک‌بارمصرف (فقط تست)", "One-time code (test only)")}>
										<Input className="mono text-start" value={form.twoFactorCode} onChange={(e) => set("twoFactorCode", e.target.value)} inputMode="numeric" maxLength={8} placeholder="123456" />
									</Field>
								</div>
							</>
						)}
					</div>
				</section>

				<section>
					<SubHead title={L("آدرس‌های عمومی", "Public addresses")} hint={L("در لینک کانفیگ و ساب‌اسکریپشن استفاده می‌شود", "Used inside config links and subscriptions")} />
					<div className="grid gap-3 sm:grid-cols-2">
						<Field label={t("srv_public_host")}><Input className="mono text-start" value={form.publicHost} onChange={(e) => set("publicHost", e.target.value)} placeholder="de1.example.com" /></Field>
						<Field label={L("آدرس ساب پنل (اختیاری)", "Panel subscription URL (optional)")}><Input className="mono text-start" value={form.subBaseUrl} onChange={(e) => set("subBaseUrl", e.target.value)} placeholder=":10882/sub/" /></Field>
					</div>
				</section>

				<section>
					<SubHead title={<span className="inline-flex items-center gap-1.5"><Sliders className="h-4 w-4" /> {L("تنظیمات", "Options")}</span>} />
					<div className="grid items-end gap-3 sm:grid-cols-2">
						<Field label={t("srv_weight")} hint={L("وزن بیشتر = انتخاب زودتر در توزیع خودکار", "Higher weight = picked sooner by auto placement")}>
							<Input type="number" min={0} max={1000} value={form.weight} onChange={(e) => set("weight", Number(e.target.value))} />
						</Field>
						<div className="tile space-y-2">
							<Switch checked={form.isActive} onChange={(v) => set("isActive", v)} label={t("active")} />
							<Switch checked={form.insecureTls} onChange={(v) => set("insecureTls", v)} label={L("پذیرش گواهی SSL نامعتبر", "Allow self-signed TLS")} />
						</div>
					</div>
				</section>

				{result &&
					("ok" in result && result.ok ? (
						<div className="space-y-2 rounded-xl border border-success/30 bg-success/10 p-3 text-[11px]">
							<div className="flex flex-wrap items-center gap-1.5">
								<Badge tone="success"><ShieldCheck className="h-3 w-3" /> {t("srv_test_ok", { n: result.inbounds.length })}</Badge>
								{result.capabilities.panelVersion && <Badge tone="cyan">{L("نسخه پنل", "Panel")} {result.capabilities.panelVersion}</Badge>}
								{result.status.xrayVersion && <Badge tone="violet">Xray {result.status.xrayVersion}</Badge>}
								{result.status.publicIp && <Badge tone="muted">IP {result.status.publicIp}</Badge>}
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
	)
}
