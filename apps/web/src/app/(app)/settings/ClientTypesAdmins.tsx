"use client"

import { useState } from "react"
import { Button, Card, Field, Input, Switch } from "@/components/ui"
import type { AdminDto } from "@/lib/dto"
import { useLocale } from "@/lib/i18n"
import { tr } from "./types"

/** Mirrors ClientTypeSettings in @srpanel/core — a client file must not import server code. */
export type ServiceKind = "BOTH" | "LIMITED" | "UNLIMITED"
export type KindAccess = { limited: boolean; unlimited: boolean; unlimitedMax: number; limitedMaxGB: number }
export type ClientTypeSettings = {
	defaultLimited: boolean
	defaultUnlimited: boolean
	defaultUnlimitedMax: number
	defaultLimitedMaxGB: number
	admins: Record<string, KindAccess>
	services: Record<string, ServiceKind>
}
/** Only what changed is sent; the API patches the stored maps. */
export type ClientTypesPatch = {
	defaultLimited?: boolean
	defaultUnlimited?: boolean
	defaultUnlimitedMax?: number
	defaultLimitedMaxGB?: number
	admins?: Record<string, Partial<KindAccess>>
	services?: Record<string, ServiceKind>
}

/** 0 everywhere means «no cap». */
export const int0 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0)

export const accessOf = (s: ClientTypeSettings, adminId: string): KindAccess =>
	s.admins[adminId] ?? { limited: s.defaultLimited, unlimited: s.defaultUnlimited, unlimitedMax: s.defaultUnlimitedMax, limitedMaxGB: s.defaultLimitedMaxGB }

type Tx = (fa: string, en: string) => string

function Row({ admin, value, busy, onSave, L }: { admin: AdminDto; value: KindAccess; busy: boolean; onSave: (p: ClientTypesPatch) => void; L: Tx }) {
	const [d, setD] = useState<KindAccess>(value)
	const dirty = d.limited !== value.limited || d.unlimited !== value.unlimited || int0(d.unlimitedMax) !== value.unlimitedMax || int0(d.limitedMaxGB) !== value.limitedMaxGB
	return (
		<div className="glass-2 space-y-3 p-3">
			<div className="flex flex-wrap items-center gap-4">
				<div className="min-w-0 flex-1 truncate text-sm">{admin.displayName || admin.username}</div>
				<Switch checked={d.limited} onChange={(v) => setD({ ...d, limited: v })} label={L("حجمی", "Volume")} />
				<Switch checked={d.unlimited} onChange={(v) => setD({ ...d, unlimited: v })} label={L("نامحدود", "Unlimited")} />
			</div>
			<div className="grid gap-3 sm:grid-cols-2">
				<Field label={L("سقف تعداد کلاینت نامحدود", "Max unlimited clients")}>
					<Input type="number" min={0} value={d.unlimitedMax} onChange={(e) => setD({ ...d, unlimitedMax: Number(e.target.value) })} />
				</Field>
				<Field label={L("سقف حجم هر کلاینت حجمی (GB)", "Max GB per volume client")}>
					<Input type="number" min={0} value={d.limitedMaxGB} onChange={(e) => setD({ ...d, limitedMaxGB: Number(e.target.value) })} />
				</Field>
			</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-[11px] text-muted">{L("۰ یعنی بدون محدودیت", "0 means no cap")}</span>
				<Button
					size="sm"
					variant="primary"
					disabled={!dirty}
					loading={busy}
					onClick={() => onSave({ admins: { [admin.id]: { limited: d.limited, unlimited: d.unlimited, unlimitedMax: int0(d.unlimitedMax), limitedMaxGB: int0(d.limitedMaxGB) } } })}
				>
					{L("ذخیره", "Save")}
				</Button>
			</div>
		</div>
	)
}

export function ClientTypesAdmins({ admins, settings, busy, onSave }: { admins: AdminDto[]; settings: ClientTypeSettings; busy: boolean; onSave: (p: ClientTypesPatch) => void }) {
	const locale = useLocale()
	const L: Tx = (fa, en) => tr(locale, fa, en)
	return (
		<Card title={L("ریسلرها", "Resellers")} subtitle={L("هر ریسلر می‌تواند اجازه و سقف جداگانه داشته باشد", "Per-reseller permission and caps")}>
			{admins.length === 0 ? (
				<p className="text-xs text-muted">{L("ریسلری ساخته نشده است.", "No resellers yet.")}</p>
			) : (
				<div className="space-y-2">
					{admins.map((a) => (
						<Row key={a.id} admin={a} value={accessOf(settings, a.id)} busy={busy} onSave={onSave} L={L} />
					))}
				</div>
			)}
		</Card>
	)
}
