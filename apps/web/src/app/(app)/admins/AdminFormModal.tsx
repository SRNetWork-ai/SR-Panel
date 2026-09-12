"use client"

import { useState, type FormEvent } from "react"
import { Globe2, Layers } from "lucide-react"
import { Badge, Button, Field, Input, Modal, SubHead, Switch, cx, useConfirm, useToast } from "@/components/ui"
import { ApiError, api } from "@/lib/client"
import type { AdminDto } from "@/lib/dto"
import { useLocale, useT } from "@/lib/i18n"
import { adminToForm, emptyForm, formToJson, isPublic, tr, type Form, type ServerLite, type ServiceLite } from "./types"

export function AdminFormModal({
	editing,
	services,
	servers,
	onClose,
	onSaved,
}: {
	editing: "new" | AdminDto
	services: ServiceLite[]
	servers: ServerLite[]
	onClose: () => void
	onSaved: (admin: AdminDto, isNew: boolean, changedServices: ServiceLite[]) => void
}) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const confirm = useConfirm()
	const target = editing === "new" ? null : editing
	const lockedOwner = target?.role === "OWNER"
	const [form, setForm] = useState<Form>(target ? adminToForm(target, services) : emptyForm)
	const [q, setQ] = useState("")
	const [busy, setBusy] = useState(false)
	const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

	const shared = services.filter(isPublic)
	const assignable = services.filter((s) => !isPublic(s))
	const shown = assignable.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase()))
	const legacy = target?.serverAccess ?? []
	const toggle = (id: string) => set("serviceIds", form.serviceIds.includes(id) ? form.serviceIds.filter((x) => x !== id) : [...form.serviceIds, id])

	/** service membership lives on the service (adminIds), so it is saved with one PATCH per changed service */
	const syncServices = async (adminId: string) => {
		const changed: ServiceLite[] = []
		for (const s of assignable) {
			const want = form.serviceIds.includes(s.id)
			if (want === s.adminIds.includes(adminId)) continue
			if (!want && s.adminIds.length === 1) {
				const warn = L(`«${s.name}» تنها به همین ادمین اختصاص دارد؛ با حذف، سرویس برای همهٔ ادمین‌ها آزاد می‌شود. ادامه می‌دهید؟`, `"${s.name}" is assigned to this admin only — removing it opens the service to every admin. Continue?`)
				if (!confirm(warn)) continue
			}
			const adminIds = want ? [...s.adminIds, adminId] : s.adminIds.filter((x) => x !== adminId)
			await api(`/api/services/${s.id}`, { method: "PATCH", json: { adminIds } })
			changed.push({ ...s, adminIds })
		}
		return changed
	}

	const submit = async (e: FormEvent) => {
		e.preventDefault()
		setBusy(true)
		try {
			const json = formToJson(form)
			const saved = target ? await api<AdminDto>(`/api/admins/${target.id}`, { method: "PATCH", json }) : await api<AdminDto>("/api/admins", { method: "POST", json })
			const changed = lockedOwner ? [] : await syncServices(saved.id)
			onSaved(saved, target === null, changed)
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setBusy(false)
		}
	}

	return (
		<Modal
			open
			onClose={onClose}
			size="xl"
			title={target ? t("ad_edit") : t("ad_add")}
			subtitle={target ? `@${target.username}` : L("یک نمایندهٔ تازه بسازید و سرویس‌های مجازش را تعیین کنید", "Create a reseller and pick the services they may sell")}
			footer={
				<Button variant="primary" type="submit" form="admin-form" loading={busy}>
					{target ? t("save") : t("create")}
				</Button>
			}
		>
			<form id="admin-form" onSubmit={submit} className="grid gap-5 md:grid-cols-2">
				<div className="space-y-3">
					<SubHead title={L("حساب کاربری", "Account")} hint={L("مشخصات ورود به پنل", "Sign-in details")} />
					<div className="grid gap-3 sm:grid-cols-2">
						<Field label={t("ad_username")}>
							<Input className="mono text-start" value={form.username} onChange={(e) => set("username", e.target.value)} required pattern="[a-z0-9_.\-]{3,32}" disabled={Boolean(lockedOwner)} autoComplete="off" />
						</Field>
						<Field label={t("ad_password")} hint={target ? t("srv_pass_keep") : L("دست‌کم ۸ کاراکتر", "At least 8 characters")}>
							<Input className="mono text-start" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required={target === null} minLength={8} autoComplete="new-password" />
						</Field>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<Field label={t("ad_display_name")}>
							<Input value={form.displayName} onChange={(e) => set("displayName", e.target.value)} />
						</Field>
						<Field label={t("cl_telegram")}>
							<Input className="mono text-start" value={form.telegramId} onChange={(e) => set("telegramId", e.target.value)} placeholder="@username" />
						</Field>
					</div>

					<SubHead title={L("سهمیه و محدودیت‌ها", "Quota & limits")} hint={t("ad_blank_unlimited")} />
					<div className="grid gap-3 sm:grid-cols-2">
						<Field label={`${t("ad_quota")} (GB)`}>
							<Input type="number" min={0} step="0.5" value={form.trafficQuotaGB} onChange={(e) => set("trafficQuotaGB", e.target.value)} placeholder="∞" />
						</Field>
						<Field label={t("ad_client_limit")}>
							<Input type="number" min={0} value={form.clientLimit} onChange={(e) => set("clientLimit", e.target.value)} placeholder="∞" />
						</Field>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<Field label={t("ad_expires")} hint={t("ad_blank_unlimited")}>
							<Input type="date" className="text-start" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
						</Field>
						<div className="flex items-end pb-1">
							<Switch checked={form.isActive} onChange={(v) => set("isActive", v)} label={t("active")} />
						</div>
					</div>
				</div>

				<div className={cx("space-y-2", lockedOwner && "pointer-events-none opacity-50")}>
					<SubHead
						title={L("سرویس‌های مجاز", "Allowed services")}
						hint={L("دسترسی ادمین با سرویس تعیین می‌شود، نه سرور و اینباند", "Access is granted per service, not per server or inbound")}
						actions={
							<div className="flex gap-1">
								<Button type="button" size="sm" variant="ghost" onClick={() => set("serviceIds", assignable.map((s) => s.id))}>
									{t("all")}
								</Button>
								<Button type="button" size="sm" variant="ghost" onClick={() => set("serviceIds", [])}>
									{L("هیچ‌کدام", "None")}
								</Button>
							</div>
						}
					/>
					{assignable.length > 4 && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("جستجوی سرویس…", "Search service…")} />}
					<div className="scrollbar-thin max-h-72 space-y-2 overflow-y-auto pe-1">
						{assignable.length === 0 && <p className="text-xs text-muted">{L("سرویس اختصاصی وجود ندارد؛ ابتدا از صفحهٔ سرویس‌ها یک سرویس بسازید.", "No assignable service yet — create one on the Services page first.")}</p>}
						{shown.map((s) => {
							const on = form.serviceIds.includes(s.id)
							return (
								<button key={s.id} type="button" onClick={() => toggle(s.id)} className={cx("pick w-full text-start", on && "pick-on")}>
									<div className="flex items-center justify-between gap-2">
										<span className="flex min-w-0 items-center gap-2">
											<Layers className="h-4 w-4 shrink-0 text-muted" />
											<span className="truncate font-medium">{s.name}</span>
										</span>
										<span className="flex shrink-0 items-center gap-1">
											{!s.isActive && <Badge tone="muted">{t("inactive")}</Badge>}
											<Badge tone={on ? "violet" : "muted"}>{s.targetCount}</Badge>
										</span>
									</div>
								</button>
							)
						})}
					</div>

					{shared.length > 0 && (
						<div className="glass glass-2 space-y-1.5 p-3">
							<div className="flex items-center gap-1.5 text-[11px] text-muted">
								<Globe2 className="h-3.5 w-3.5" />
								{L("سرویس‌های عمومی — برای همهٔ ادمین‌ها باز است", "Shared services — open to every admin")}
							</div>
							<div className="flex flex-wrap gap-1">
								{shared.map((s) => (
									<Badge key={s.id} tone="cyan">
										{s.name}
									</Badge>
								))}
							</div>
							<p className="text-[10px] text-muted">{L("برای محدود کردن، در صفحهٔ سرویس‌ها ادمین‌های مجاز را مشخص کنید.", "Restrict them on the Services page by selecting allowed admins.")}</p>
						</div>
					)}

					{legacy.length > 0 && (
						<p className="text-[10px] text-muted">
							{L("دسترسی قدیمی سرور/اینباند این ادمین دست‌نخورده می‌ماند", "This admin's legacy server access is left unchanged")}: {legacy.map((x) => servers.find((s) => s.id === x.serverId)?.name ?? "?").join(" • ")}
						</p>
					)}
				</div>
			</form>
		</Modal>
	)
}
