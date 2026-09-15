"use client"

import { useEffect, useState } from "react"
import { Plus, Save, Trash2 } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import { useLocale } from "@/lib/i18n"
import { Button, Card, Input, cx, useToast } from "@/components/ui"
import { tr, type PlansPayload, type Reseller, type ResellerPlanDto } from "./types"

/** Owner-side editor of the reseller package catalogue (one Setting key). */
const blank = (sortOrder: number): ResellerPlanDto => ({ id: "", name: "", description: "", gb: 0, days: 0, clients: 0, price: 0, isActive: true, sortOrder, adminIds: [] })
const num = (v: string) => Math.max(0, Math.round(Number(v) || 0))

export function PlansAdmin({ enabled, plans, onSaved }: { enabled: boolean; plans: ResellerPlanDto[]; onSaved: (next: PlansPayload) => void }) {
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [on, setOn] = useState(enabled)
	const [rows, setRows] = useState<ResellerPlanDto[]>(plans)
	const [resellers, setResellers] = useState<Reseller[]>([])
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		api<{ resellers: Reseller[] }>("/api/wallet/resellers")
			.then((r) => setResellers(r.resellers))
			.catch(() => undefined)
	}, [])

	const patch = (i: number, p: Partial<ResellerPlanDto>) => setRows((l) => l.map((row, idx) => (idx === i ? { ...row, ...p } : row)))
	const toggleAdmin = (i: number, id: string) =>
		setRows((l) => l.map((row, idx) => (idx === i ? { ...row, adminIds: row.adminIds.includes(id) ? row.adminIds.filter((x) => x !== id) : [...row.adminIds, id] } : row)))

	const save = async () => {
		setSaving(true)
		try {
			const next = await api<PlansPayload>("/api/wallet/plans", { method: "PUT", json: { enabled: on, plans: rows } })
			setRows(next.plans)
			onSaved(next)
			toast.ok(L("بسته‌ها ذخیره شد", "Packages saved"))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : L("ذخیره نشد", "Save failed"))
		} finally {
			setSaving(false)
		}
	}

	return (
		<Card
			title={L("بسته‌های نمایندگی", "Reseller packages")}
			subtitle={L("نماینده این بسته‌ها را از کیف پول خود می‌خرد و حجم / زمان / ظرفیت به حساب خودش اضافه می‌شود", "Resellers buy these from their wallet; traffic / validity / slots are added to their own account")}
			actions={
				<div className="flex flex-wrap items-center gap-2">
					<label className="flex items-center gap-1.5 text-xs">
						<input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
						{L("فعال", "Enabled")}
					</label>
					<Button type="button" size="sm" variant="ghost" onClick={() => setRows((l) => [...l, blank(l.length)])}><Plus className="h-4 w-4" />{L("بستهٔ جدید", "New package")}</Button>
					<Button type="button" size="sm" variant="primary" disabled={saving} onClick={save}><Save className="h-4 w-4" />{L("ذخیره", "Save")}</Button>
				</div>
			}
		>
			{rows.length === 0 ? (
				<p className="text-xs text-muted">{L("هنوز بسته‌ای نساخته‌اید؛ با «بستهٔ جدید» شروع کنید.", "No package yet — start with «New package».")}</p>
			) : (
				<div className="space-y-3">
					{rows.map((p, i) => (
						<div key={p.id || `new-${i}`} className="tile space-y-2">
							<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
								<label className="space-y-1 xl:col-span-2">
									<span className="text-[11px] text-muted">{L("نام بسته", "Package name")}</span>
									<Input value={p.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder={L("مثلاً ۱ ترابایت / ۳۰ روز", "e.g. 1 TB / 30 days")} />
								</label>
								<label className="space-y-1">
									<span className="text-[11px] text-muted">{L("حجم (GB)", "Traffic (GB)")}</span>
									<Input type="number" min={0} value={p.gb} onChange={(e) => patch(i, { gb: num(e.target.value) })} />
								</label>
								<label className="space-y-1">
									<span className="text-[11px] text-muted">{L("مدت (روز)", "Days")}</span>
									<Input type="number" min={0} value={p.days} onChange={(e) => patch(i, { days: num(e.target.value) })} />
								</label>
								<label className="space-y-1">
									<span className="text-[11px] text-muted">{L("ظرفیت کلاینت", "Client slots")}</span>
									<Input type="number" min={0} value={p.clients} onChange={(e) => patch(i, { clients: num(e.target.value) })} />
								</label>
								<label className="space-y-1">
									<span className="text-[11px] text-muted">{L("قیمت (تومان)", "Price (IRT)")}</span>
									<Input type="number" min={0} value={p.price} onChange={(e) => patch(i, { price: num(e.target.value) })} />
								</label>
							</div>

							<label className="block space-y-1">
								<span className="text-[11px] text-muted">{L("توضیح (اختیاری)", "Description (optional)")}</span>
								<Input value={p.description} onChange={(e) => patch(i, { description: e.target.value })} />
							</label>

							<div className="space-y-1">
								<span className="text-[11px] text-muted">{L("برای کدام نماینده‌ها؟ (خالی = همه)", "Offered to (empty = everyone)")}</span>
								<div className="flex flex-wrap gap-1.5">
									{resellers.length === 0 ? (
										<span className="text-[11px] text-muted">—</span>
									) : (
										resellers.map((r) => (
											<button type="button" key={r.id} onClick={() => toggleAdmin(i, r.id)} className={cx("chip", p.adminIds.includes(r.id) && "chip-on")}>
												{r.displayName || r.username}
											</button>
										))
									)}
								</div>
							</div>

							<div className="flex flex-wrap items-center gap-3">
								<label className="flex items-center gap-1.5 text-xs">
									<input type="checkbox" checked={p.isActive} onChange={(e) => patch(i, { isActive: e.target.checked })} />
									{L("فعال", "Active")}
								</label>
								<label className="flex items-center gap-1.5 text-xs">
									{L("ترتیب", "Order")}
									<Input type="number" className="w-20" value={p.sortOrder} onChange={(e) => patch(i, { sortOrder: Math.round(Number(e.target.value) || 0) })} />
								</label>
								<Button type="button" size="icon" variant="danger" title={L("حذف", "Delete")} onClick={() => setRows((l) => l.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
							</div>
						</div>
					))}
				</div>
			)}
		</Card>
	)
}
