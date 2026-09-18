"use client"

import { useEffect, useState } from "react"
import { Badge, Button, Card, Field, Input, Select, Spinner, Switch, useToast } from "@/components/ui"
import { ApiError, api } from "@/lib/client"
import type { AdminDto, ServiceDto } from "@/lib/dto"
import { useLocale, useT } from "@/lib/i18n"
import { ClientTypesAdmins, int0, type ClientTypeSettings, type ClientTypesPatch, type KindAccess, type ServiceKind } from "./ClientTypesAdmins"
import { tr } from "./types"

const ENDPOINT = "/api/settings/client-types"

/**
 * Owner-only: who may create «حجمی» / «نامحدود» clients, how many unlimited
 * clients a reseller may own, how big a single volume client may get, and which
 * client type each service is offered for. Caps are enforced server-side on
 * create, edit and bulk traffic top-up.
 */
export function ClientTypesTab() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [settings, setSettings] = useState<ClientTypeSettings | null>(null)
	const [admins, setAdmins] = useState<AdminDto[]>([])
	const [services, setServices] = useState<ServiceDto[]>([])
	const [d, setD] = useState<KindAccess>({ limited: true, unlimited: false, unlimitedMax: 0, limitedMaxGB: 0 })
	const [busy, setBusy] = useState(false)
	const msg = (e: unknown) => (e instanceof ApiError ? e.message : t("error_generic"))

	const apply = (s: ClientTypeSettings) => {
		setSettings(s)
		setD({ limited: s.defaultLimited, unlimited: s.defaultUnlimited, unlimitedMax: s.defaultUnlimitedMax, limitedMaxGB: s.defaultLimitedMaxGB })
	}

	useEffect(() => {
		void (async () => {
			try {
				const [cfg, list, svc] = await Promise.all([api<{ settings: ClientTypeSettings }>(ENDPOINT), api<AdminDto[]>("/api/admins"), api<{ services: ServiceDto[] }>("/api/services")])
				apply(cfg.settings)
				setAdmins(list.filter((a) => a.role === "ADMIN"))
				setServices(svc.services)
			} catch (e) {
				toast.err(msg(e))
			}
		})()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const save = async (patch: ClientTypesPatch) => {
		if (busy) return
		setBusy(true)
		try {
			const r = await api<{ settings: ClientTypeSettings }>(ENDPOINT, { method: "PUT", json: patch })
			apply(r.settings)
			toast.ok(t("set_saved"))
		} catch (e) {
			toast.err(msg(e))
		} finally {
			setBusy(false)
		}
	}

	if (!settings)
		return (
			<Card title={L("نوع کلاینت‌ها", "Client types")}>
				<div className="flex justify-center p-6">
					<Spinner />
				</div>
			</Card>
		)

	const s = settings
	return (
		<div className="space-y-6">
			<Card
				title={L("پیش‌فرض همهٔ ریسلرها", "Reseller defaults")}
				subtitle={L("برای هر ریسلری که تنظیم اختصاصی ندارد اعمال می‌شود", "Applies to every reseller without an explicit row")}
				actions={<Badge tone="violet">{L("۰ = بدون محدودیت", "0 = no cap")}</Badge>}
			>
				<div className="flex flex-wrap items-center gap-6">
					<Switch checked={d.limited} onChange={(v) => setD({ ...d, limited: v })} label={L("اجازهٔ ساخت کلاینت حجمی", "May create volume clients")} />
					<Switch checked={d.unlimited} onChange={(v) => setD({ ...d, unlimited: v })} label={L("اجازهٔ ساخت کلاینت نامحدود", "May create unlimited clients")} />
				</div>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					<Field
						label={L("سقف تعداد کلاینت نامحدود هر ریسلر", "Max unlimited clients per reseller")}
						hint={L("وقتی سقف پر شد، ساخت کلاینت نامحدود رد می‌شود", "One more is rejected once the cap is hit")}
					>
						<Input type="number" min={0} value={d.unlimitedMax} onChange={(e) => setD({ ...d, unlimitedMax: Number(e.target.value) })} />
					</Field>
					<Field
						label={L("سقف حجم هر کلاینت حجمی (گیگابایت)", "Max GB per volume client")}
						hint={L("روی ساخت، ویرایش و افزودن حجم گروهی اعمال می‌شود", "Enforced on create, edit and bulk top-up")}
					>
						<Input type="number" min={0} value={d.limitedMaxGB} onChange={(e) => setD({ ...d, limitedMaxGB: Number(e.target.value) })} />
					</Field>
				</div>
				<div className="mt-4 flex justify-end">
					<Button
						variant="primary"
						loading={busy}
						onClick={() => void save({ defaultLimited: d.limited, defaultUnlimited: d.unlimited, defaultUnlimitedMax: int0(d.unlimitedMax), defaultLimitedMaxGB: int0(d.limitedMaxGB) })}
					>
						{L("ذخیره", "Save")}
					</Button>
				</div>
			</Card>

			<ClientTypesAdmins admins={admins} settings={s} busy={busy} onSave={(p) => void save(p)} />

			<Card title={L("سرویس‌ها", "Services")} subtitle={L("هر سرویس برای کدام نوع کلاینت ارائه شود", "Which client type each service is offered for")}>
				{services.length === 0 ? (
					<p className="text-xs text-muted">{L("سرویسی وجود ندارد.", "No services yet.")}</p>
				) : (
					<div className="space-y-2">
						{services.map((sv) => (
							<div key={sv.id} className="glass-2 flex flex-wrap items-center gap-3 p-3">
								<div className="min-w-0 flex-1 truncate text-sm">{sv.name}</div>
								<Select className="w-full sm:w-52" value={s.services[sv.id] ?? "BOTH"} onChange={(e) => void save({ services: { [sv.id]: e.target.value as ServiceKind } })}>
									<option value="BOTH">{L("حجمی و نامحدود", "Both")}</option>
									<option value="LIMITED">{L("فقط حجمی", "Volume only")}</option>
									<option value="UNLIMITED">{L("فقط نامحدود", "Unlimited only")}</option>
								</Select>
							</div>
						))}
					</div>
				)}
			</Card>
		</div>
	)
}
