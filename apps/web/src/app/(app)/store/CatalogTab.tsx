"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Eye, EyeOff, FolderPlus, RefreshCw, Save, Trash2 } from "lucide-react"
import { api } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Input, Select, Spinner, useConfirm, useToast } from "@/components/ui"
import { CatalogPlans } from "./CatalogPlans"
import { ICON_LABEL, PAGE_ICONS, newCatalogCategory, tr, type CatalogCategory, type CatalogDto, type Plan } from "./types"

/**
 * Storefront catalogue editor: plan categories plus the extended per-plan
 * options. Everything is stored in one Setting object, so the whole screen is
 * edited locally and saved with a single request.
 */
export function CatalogTab() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const confirm = useConfirm()
	const [catalog, setCatalog] = useState<CatalogDto | null>(null)
	const [plans, setPlans] = useState<Plan[]>([])
	const [saving, setSaving] = useState(false)

	const load = useCallback(async () => {
		const [c, p] = await Promise.all([api<{ catalog: CatalogDto }>("/api/store/catalog"), api<{ plans: Plan[] }>("/api/plans")])
		setCatalog(c.catalog)
		setPlans(p.plans)
	}, [])

	useEffect(() => {
		load().catch((err) => toast.err(err instanceof Error ? err.message : t("error_generic")))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [load])

	const counts = useMemo(() => {
		const m = new Map<string, number>()
		if (!catalog) return m
		for (const p of plans) {
			const id = catalog.items[p.id]?.categoryId ?? ""
			if (id) m.set(id, (m.get(id) ?? 0) + 1)
		}
		return m
	}, [catalog, plans])

	const patch = (p: Partial<CatalogDto>) => setCatalog((c) => (c ? { ...c, ...p } : c))

	const editCategory = (index: number, p: Partial<CatalogCategory>) =>
		setCatalog((c) => (c ? { ...c, categories: c.categories.map((x, i) => (i === index ? { ...x, ...p } : x)) } : c))

	function addCategory() {
		setCatalog((c) => (c ? { ...c, categories: [...c.categories, newCatalogCategory(c.categories.length)] } : c))
	}

	function removeCategory(cat: CatalogCategory) {
		if (!confirm(t("confirm_delete"))) return
		setCatalog((c) => {
			if (!c) return c
			const items = Object.fromEntries(Object.entries(c.items).map(([k, v]) => [k, v.categoryId === cat.id ? { ...v, categoryId: "" } : v]))
			return { ...c, categories: c.categories.filter((x) => x.id !== cat.id), items }
		})
	}

	async function save() {
		if (!catalog) return
		// a category without a name cannot be stored, so blank rows are dropped
		const categories = catalog.categories.filter((c) => c.name.trim().length > 0)
		setSaving(true)
		try {
			const r = await api<{ catalog: CatalogDto }>("/api/store/catalog", { method: "PUT", json: { ...catalog, categories } })
			setCatalog(r.catalog)
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
	}

	if (!catalog) return <div className="flex justify-center p-10"><Spinner /></div>

	return (
		<div className="space-y-5">
			<Card
				title={L("دسته‌بندی پلن‌ها", "Plan categories")}
				subtitle={L("پلن‌ها را گروه‌بندی کنید تا خریدار در فروشگاه فقط پلن‌های همان گروه را ببیند.", "Group plans so buyers can filter the storefront by category.")}
				actions={
					<>
						<Button type="button" size="sm" variant="ghost" title={L("بارگیری مجدد", "Reload")} onClick={() => load().catch(() => undefined)}><RefreshCw className="h-4 w-4" /></Button>
						<Button type="button" variant="primary" disabled={saving} onClick={save}><Save className="h-4 w-4" /> {L("ذخیره", "Save")}</Button>
					</>
				}
			>
				<div className="space-y-4">
					<div className="flex flex-wrap items-center gap-4">
						<label className="flex items-center gap-2 text-sm">
							<input type="checkbox" className="h-4 w-4" checked={catalog.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
							{L("فعال‌سازی دسته‌بندی و آپشن‌ها", "Enable catalogue & options")}
						</label>
						<label className="flex items-center gap-2 text-sm">
							<input type="checkbox" className="h-4 w-4" checked={catalog.showCounts} onChange={(e) => patch({ showCounts: e.target.checked })} />
							{L("نمایش تعداد پلن هر دسته", "Show plan count per category")}
						</label>
						<Badge tone={catalog.enabled ? "success" : "muted"}>{catalog.enabled ? t("active") : t("inactive")}</Badge>
					</div>

					{!catalog.enabled ? (
						<p className="text-xs text-muted">
							{L("تا وقتی این گزینه خاموش باشد، دسته‌بندی و آپشن‌های اضافی (برچسب، ویژگی‌ها، موجودی و سقف خرید) در فروشگاه اعمال نمی‌شود.", "While this is off, categories and the extra plan options are ignored by the storefront.")}
						</p>
					) : null}

					{catalog.categories.length === 0 ? (
						<Empty
							text={L("هنوز دسته‌ای نساخته‌اید", "No categories yet")}
							action={<Button type="button" variant="primary" onClick={addCategory}><FolderPlus className="h-4 w-4" /> {L("افزودن دسته", "Add category")}</Button>}
						/>
					) : (
						<div className="space-y-2">
							{catalog.categories.map((c, i) => (
								<div key={c.id} className="tile grid items-center gap-2 p-3 md:grid-cols-12">
									<Input className="md:col-span-3" value={c.name} onChange={(e) => editCategory(i, { name: e.target.value })} placeholder={L("نام دسته مانند «اقتصادی»", "Category name")} />
									<Input className="md:col-span-4" value={c.description} onChange={(e) => editCategory(i, { description: e.target.value })} placeholder={L("توضیح کوتاه (اختیاری)", "Short description (optional)")} />
									<Select className="md:col-span-2" value={c.icon} onChange={(e) => editCategory(i, { icon: e.target.value as CatalogCategory["icon"] })}>
										{PAGE_ICONS.map((ic) => (
											<option key={ic} value={ic}>{tr(locale, ICON_LABEL[ic].fa, ICON_LABEL[ic].en)}</option>
										))}
									</Select>
									<Input className="md:col-span-1" type="number" min={0} value={c.sortOrder} onChange={(e) => editCategory(i, { sortOrder: Number(e.target.value) || 0 })} title={L("ترتیب نمایش", "Sort order")} />
									<div className="flex items-center justify-end gap-1.5 md:col-span-2">
										<span className="num text-xs text-muted">{formatNumber(counts.get(c.id) ?? 0, locale)}</span>
										<Button type="button" size="sm" variant="ghost" title={c.isActive ? t("inactive") : t("active")} onClick={() => editCategory(i, { isActive: !c.isActive })}>
											{c.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
										</Button>
										<Button type="button" size="sm" variant="danger" onClick={() => removeCategory(c)}><Trash2 className="h-4 w-4" /></Button>
									</div>
								</div>
							))}
							<Button type="button" size="sm" onClick={addCategory}><FolderPlus className="h-4 w-4" /> {L("افزودن دسته", "Add category")}</Button>
							<p className="text-xs text-muted">{L("دسته‌های بدون پلن و دسته‌های غیرفعال در فروشگاه نمایش داده نمی‌شوند.", "Empty or inactive categories are hidden from the storefront.")}</p>
						</div>
					)}
				</div>
			</Card>

			<CatalogPlans
				plans={plans}
				categories={catalog.categories}
				items={catalog.items}
				saving={saving}
				onChange={(items) => patch({ items })}
				onSave={save}
			/>
		</div>
	)
}
