"use client"

import { useEffect, useState } from "react"
import { Infinity as InfinityIcon, Gauge, Save, Users } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import type { ServiceDto } from "@/lib/dto"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, PageHeader, cx, useToast } from "@/components/ui"

type ServiceKind = "BOTH" | "LIMITED" | "UNLIMITED"
type KindAccess = { limited: boolean; unlimited: boolean }
type Settings = {
	defaultLimited: boolean
	defaultUnlimited: boolean
	admins: Record<string, KindAccess>
	services: Record<string, ServiceKind>
}
/** Subset of Reseller from /api/wallet/resellers. */
type Reseller = { id: string; username: string; displayName: string | null; isActive: boolean }

export function ClientTypesClient({ settings, services }: { settings: Settings; services: ServiceDto[] }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const toast = useToast()
	const [st, setSt] = useState<Settings>(settings)
	const [resellers, setResellers] = useState<Reseller[]>([])
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		api<{ resellers: Reseller[] }>("/api/wallet/resellers")
			.then((r) => setResellers(r.resellers))
			.catch(() => undefined)
	}, [])

	const setAdmin = (id: string, patch: Partial<KindAccess>) =>
		setSt((s) => {
			const cur = s.admins[id] ?? { limited: s.defaultLimited, unlimited: s.defaultUnlimited }
			return { ...s, admins: { ...s.admins, [id]: { ...cur, ...patch } } }
		})
	const setServiceKind = (id: string, kind: ServiceKind) => setSt((s) => ({ ...s, services: { ...s.services, [id]: kind } }))
	const accessOf = (id: string): KindAccess => st.admins[id] ?? { limited: st.defaultLimited, unlimited: st.defaultUnlimited }
	const kindOf = (id: string): ServiceKind => st.services[id] ?? "BOTH"

	const save = async () => {
		setBusy(true)
		try {
			const r = await api<{ settings: Settings }>("/api/settings/client-types", { method: "PUT", json: st })
			setSt(r.settings)
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setBusy(false)
		}
	}

	const check = (on: boolean, onChange: (v: boolean) => void, label: string) => (
		<label className="flex cursor-pointer items-center gap-2">
			<input type="checkbox" className="h-4 w-4" checked={on} onChange={(e) => onChange(e.target.checked)} />
			<span className="text-xs">{label}</span>
		</label>
	)

	const KINDS: { key: ServiceKind; fa: string; en: string }[] = [
		{ key: "BOTH", fa: "هر دو", en: "Both" },
		{ key: "LIMITED", fa: "فقط حجمی", en: "Limited only" },
		{ key: "UNLIMITED", fa: "فقط نامحدود", en: "Unlimited only" },
	]

	return (
		<div className="space-y-4">
			<PageHeader
				title={L("انواع کلاینت", "Client types")}
				subtitle={L("مشخص کنید هر نماینده بتواند کلاینت حجمی یا نامحدود بسازد و هر سرویس برای کدام نوع ارائه شود", "Choose which resellers may create limited or unlimited clients, and which type each service is offered for")}
				actions={
					<Button variant="primary" onClick={save} loading={busy}>
						<Save className="h-4 w-4" />
						{t("save")}
					</Button>
				}
			/>

			<Card>
				<div className="label mb-2 flex items-center gap-1.5">
					<Gauge className="h-3.5 w-3.5 text-violet-soft" />
					{L("پیش‌فرض برای نمایندگان جدید", "Default for new resellers")}
				</div>
				<div className="flex flex-wrap gap-6">
					{check(st.defaultLimited, (v) => setSt((s) => ({ ...s, defaultLimited: v })), L("ساخت کلاینت حجمی", "May create limited clients"))}
					{check(st.defaultUnlimited, (v) => setSt((s) => ({ ...s, defaultUnlimited: v })), L("ساخت کلاینت نامحدود", "May create unlimited clients"))}
				</div>
				<p className="mt-2 text-[11px] text-muted">{L("مالک همیشه هر دو نوع را می‌سازد. تغییرات تا ۳۰ ذانیه طول می‌کشد تا روی پنل نماینده اعمال شود.", "The owner may always create both. Changes can take up to 30 seconds to reach a reseller panel.")}</p>
			</Card>

			<Card bodyClassName="px-0 pb-0">
				<div className="label mb-2 flex items-center gap-1.5 px-4">
					<Users className="h-3.5 w-3.5 text-violet-soft" />
					{L("دسترسی هر نماینده", "Per-reseller access")}
				</div>
				{resellers.length === 0 ? (
					<p className="px-4 pb-4 text-xs text-muted">{L("هنوز نماینده‌ای ساخته نشده است.", "No reseller has been created yet.")}</p>
				) : (
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr>
									<th>{L("نماینده", "Reseller")}</th>
									<th>{L("حجمی", "Limited")}</th>
									<th>{L("نامحدود", "Unlimited")}</th>
									<th>{L("وضعیت", "State")}</th>
								</tr>
							</thead>
							<tbody>
								{resellers.map((r) => {
									const a = accessOf(r.id)
									const explicit = st.admins[r.id] !== undefined
									return (
										<tr key={r.id}>
											<td>
												<div className="flex flex-wrap items-center gap-1.5">
													<span className="font-medium">{r.displayName || r.username}</span>
													<span className="mono text-[11px] text-muted" dir="ltr">@{r.username}</span>
												</div>
											</td>
											<td>{check(a.limited, (v) => setAdmin(r.id, { limited: v }), L("مجاز", "Allowed"))}</td>
											<td>{check(a.unlimited, (v) => setAdmin(r.id, { unlimited: v }), L("مجاز", "Allowed"))}</td>
											<td>
												<div className="flex flex-wrap items-center gap-1.5">
													{!r.isActive && <Badge tone="danger">{L("غیرفعال", "Disabled")}</Badge>}
													<Badge tone={explicit ? "violet" : "muted"}>{explicit ? L("سفارشی", "Custom") : L("پیش‌فرض", "Default")}</Badge>
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

			<Card>
				<div className="label mb-2 flex items-center gap-1.5">
					<InfinityIcon className="h-3.5 w-3.5 text-violet-soft" />
					{L("ارائهٔ هر سرویس", "Per-service offering")}
				</div>
				{services.length === 0 ? (
					<p className="text-xs text-muted">{L("هنوز سرویسی تعریف نشده است.", "No service has been defined yet.")}</p>
				) : (
					<div className="space-y-2">
						{services.map((svc) => (
							<div key={svc.id} className="tile flex flex-wrap items-center justify-between gap-2">
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-1.5">
										<span className="truncate text-sm font-medium">{svc.name}</span>
										{!svc.isActive && <Badge tone="muted">{L("غیرفعال", "Inactive")}</Badge>}
									</div>
									{svc.description && <p className="mt-0.5 text-[11px] text-muted">{svc.description}</p>}
								</div>
								<div className="flex flex-wrap gap-1.5">
									{KINDS.map((k) => (
										<button key={k.key} type="button" className={cx("chip", kindOf(svc.id) === k.key && "chip-on")} onClick={() => setServiceKind(svc.id, k.key)}>
											{L(k.fa, k.en)}
										</button>
									))}
								</div>
							</div>
						))}
					</div>
				)}
				<p className="mt-2 text-[11px] text-muted">{L("سرویسی که روی «فقط حجمی» یا «فقط نامحدود» باشد، در فرم نوع دیگر دیده نمی‌شود و درخواست سمت سرور رد می‌شود.", "A service set to one type disappears from the other form and is rejected server-side.")}</p>
			</Card>
		</div>
	)
}
