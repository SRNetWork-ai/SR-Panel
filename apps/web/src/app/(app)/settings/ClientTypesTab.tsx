"use client"

import { useEffect, useState } from "react"
import { Badge, Button, Card, Field, Input, Select, Spinner, Switch, useToast } from "@/components/ui"
import { ApiError, api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { tr } from "./types"

type ServiceKind = "BOTH" | "LIMITED" | "UNLIMITED"
type Defaults = { defaultLimited: boolean; defaultUnlimited: boolean; defaultUnlimitedMax: number; defaultLimitedMaxGB: number }
type AdminRow = {
	id: string
	username: string
	limited: boolean
	unlimited: boolean
	unlimitedMax: number
	limitedMaxGB: number
	unlimitedUsed: number
	inherited: boolean
}
type ServiceRow = { id: string; name: string; isActive: boolean; kind: ServiceKind }
type Board = { settings: Defaults; admins: AdminRow[]; services: ServiceRow[] }

const ENDPOINT = "/api/settings/client-types"
const toInt = (v: string) => Math.max(0, Math.floor(Number(v) || 0))

/**
 * Owner-only: who may sell «حجمی» / «نامحدود» clients, how many unlimited
 * clients each reseller may own and how big a single limited client may be.
 * 0 always means «no cap». The panel enforces these on create and on update.
 */
export function ClientTypesTab() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [board, setBoard] = useState<Board | null>(null)
	const [busy, setBusy] = useState("")
	const msg = (e: unknown) => (e instanceof ApiError ? e.message : t("error_generic"))

	const load = async () => {
		try {
			setBoard(await api<Board>(ENDPOINT))
		} catch (e) {
			toast.err(msg(e))
		}
	}

	useEffect(() => {
		void load()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const save = async (key: string, json: Record<string, unknown>) => {
		if (busy) return
		setBusy(key)
		try {
			setBoard(await api<Board>(ENDPOINT, { method: "PUT", json }))
			toast.ok(t("set_saved"))
		} catch (e) {
			toast.err(msg(e))
		} finally {
			setBusy("")
		}
	}

	const editDefaults = (patch: Partial<Defaults>) => setBoard((b) => (b ? { ...b, settings: { ...b.settings, ...patch } } : b))
	const editAdmin = (id: string, patch: Partial<AdminRow>) =>
		setBoard((b) => (b ? { ...b, admins: b.admins.map((a) => (a.id === id ? { ...a, ...patch } : a)) } : b))

	if (!board)
		return (
			<Card title={L("نوع کلاینت", "Client types")}>
				<div className="flex justify-center p-6">
					<Spinner />
				</div>
			</Card>
		)

	const s = board.settings
	const noCap = L("۰ یعنی بدون محدودیت", "0 means no cap")

	return (
		<div className="space-y-6">
			<Card
				title={L("پیش‌فرض همهٔ نماینده‌ها", "Default for every reseller")}
				subtitle={L("هر نماینده‌ای که ردیف اختصاصی ندارد، این مقادیر را می‌گیرد", "Applies to every reseller without an explicit row")}
				actions={
					<Button
						size="sm"
						loading={busy === "defaults"}
						onClick={() =>
							void save("defaults", {
								defaultLimited: s.defaultLimited,
								defaultUnlimited: s.defaultUnlimited,
								defaultUnlimitedMax: s.defaultUnlimitedMax,
								defaultLimitedMaxGB: s.defaultLimitedMaxGB,
							})
						}
					>
						{L("ذخیره", "Save")}
					</Button>
				}
			>
				<div className="grid gap-4 sm:grid-cols-2">
					<Switch checked={s.defaultLimited} onChange={() => editDefaults({ defaultLimited: !s.defaultLimited })} label={L("اجازهٔ کلاینت حجمی", "May sell limited")} />
					<Switch checked={s.defaultUnlimited} onChange={() => editDefaults({ defaultUnlimited: !s.defaultUnlimited })} label={L("اجازهٔ کلاینت نامحدود", "May sell unlimited")} />
					<Field label={L("سقف تعداد کلاینت نامحدود", "Max unlimited clients")} hint={noCap}>
						<Input dir="ltr" inputMode="numeric" value={String(s.defaultUnlimitedMax)} onChange={(e) => editDefaults({ defaultUnlimitedMax: toInt(e.target.value) })} />
					</Field>
					<Field label={L("سقف حجم هر کلاینت حجمی (GB)", "Max GB per limited client")} hint={noCap}>
						<Input dir="ltr" inputMode="numeric" value={String(s.defaultLimitedMaxGB)} onChange={(e) => editDefaults({ defaultLimitedMaxGB: toInt(e.target.value) })} />
					</Field>
				</div>
			</Card>

			<Card title={L("نماینده‌ها", "Resellers")} subtitle={L("مقدار اختصاصی هر نماینده بر پیش‌فرض ارجحیت دارد", "A per-reseller value wins over the default")}>
				{board.admins.length === 0 ? (
					<p className="text-xs text-muted">{L("هنوز نماینده‌ای ساخته نشده است.", "No reseller yet.")}</p>
				) : (
					<div className="space-y-3">
						{board.admins.map((a) => (
							<div key={a.id} className="glass-2 space-y-3 p-3">
								<div className="flex flex-wrap items-center gap-2">
									<span className="text-sm font-medium">{a.username}</span>
									{a.inherited && <Badge tone="muted">{L("پیش‌فرض", "Default")}</Badge>}
									<Badge tone={a.unlimitedMax > 0 && a.unlimitedUsed >= a.unlimitedMax ? "danger" : "muted"}>
										{`${L("نامحدود فعلی", "Unlimited now")}: ${a.unlimitedUsed}${a.unlimitedMax > 0 ? ` / ${a.unlimitedMax}` : ""}`}
									</Badge>
									<div className="flex-1" />
									<Button
										size="sm"
										loading={busy === a.id}
										onClick={() =>
											void save(a.id, {
												admins: { [a.id]: { limited: a.limited, unlimited: a.unlimited, unlimitedMax: a.unlimitedMax, limitedMaxGB: a.limitedMaxGB } },
											})
										}
									>
										{L("ذخیره", "Save")}
									</Button>
								</div>
								<div className="grid gap-3 sm:grid-cols-4">
									<Switch checked={a.limited} onChange={() => editAdmin(a.id, { limited: !a.limited })} label={L("حجمی", "Limited")} />
									<Switch checked={a.unlimited} onChange={() => editAdmin(a.id, { unlimited: !a.unlimited })} label={L("نامحدود", "Unlimited")} />
									<Field label={L("سقف تعداد نامحدود", "Max unlimited")}>
										<Input dir="ltr" inputMode="numeric" value={String(a.unlimitedMax)} onChange={(e) => editAdmin(a.id, { unlimitedMax: toInt(e.target.value) })} />
									</Field>
									<Field label={L("سقف حجم هر کلاینت (GB)", "Max GB per client")}>
										<Input dir="ltr" inputMode="numeric" value={String(a.limitedMaxGB)} onChange={(e) => editAdmin(a.id, { limitedMaxGB: toInt(e.target.value) })} />
									</Field>
								</div>
							</div>
						))}
					</div>
				)}
			</Card>

			<Card title={L("سرویس‌ها", "Services")} subtitle={L("هر سرویس برای کدام نوع کلاینت ارائه می‌شود", "Which client type each service is offered for")}>
				{board.services.length === 0 ? (
					<p className="text-xs text-muted">{L("هنوز سرویسی ساخته نشده است.", "No service yet.")}</p>
				) : (
					<div className="space-y-2">
						{board.services.map((sv) => (
							<div key={sv.id} className="glass-2 flex flex-wrap items-center gap-3 p-3">
								<span className="min-w-0 flex-1 truncate text-sm">{sv.name}</span>
								{!sv.isActive && <Badge tone="warning">{L("غیرفعال", "Off")}</Badge>}
								<Select value={sv.kind} onChange={(e) => void save(sv.id, { services: { [sv.id]: e.target.value } })}>
									<option value="BOTH">{L("حجمی و نامحدود", "Both")}</option>
									<option value="LIMITED">{L("فقط حجمی", "Limited only")}</option>
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
