"use client"

import { useMemo, useState } from "react"
import { Save, Search, Wand2 } from "lucide-react"
import { formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Button, Card, Empty, Input, Select, Textarea } from "@/components/ui"
import { emptyPlanOptions, tr, type CatalogCategory, type CatalogDto, type Plan, type PlanOptions } from "./types"

/**
 * Per-plan storefront options: category, ribbon, feature bullets, card note,
 * stock and the per-account purchase cap. Editing is local; the parent tab
 * stores the whole catalogue in one request.
 */
type Props = {
	plans: Plan[]
	categories: CatalogCategory[]
	items: CatalogDto["items"]
	saving: boolean
	onChange: (items: CatalogDto["items"]) => void
	onSave: () => void
}

const parseLines = (s: string) =>
	s
		.split("\n")
		.map((x) => x.trim())
		.filter((x) => x.length > 0)
		.slice(0, 8)

export function CatalogPlans({ plans, categories, items, saving, onChange, onSave }: Props) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const [q, setQ] = useState("")
	const [filter, setFilter] = useState("all")
	const [bulk, setBulk] = useState("")
	const [drafts, setDrafts] = useState<Record<string, string>>({})

	const named = categories.filter((c) => c.name.trim().length > 0)

	const optionsOf = (id: string): PlanOptions => items[id] ?? emptyPlanOptions()
	const set = (id: string, p: Partial<PlanOptions>) => onChange({ ...items, [id]: { ...optionsOf(id), ...p } })

	const shown = useMemo(() => {
		const needle = q.trim().toLowerCase()
		return plans.filter((p) => {
			const cat = items[p.id]?.categoryId ?? ""
			if (filter === "none" && cat) return false
			if (filter !== "all" && filter !== "none" && cat !== filter) return false
			if (!needle) return true
			return [p.name, p.serviceName ?? "", items[p.id]?.ribbon ?? ""].join(" ").toLowerCase().includes(needle)
		})
	}, [plans, items, q, filter])

	const unassigned = plans.filter((p) => !(items[p.id]?.categoryId ?? "")).length

	function applyBulk() {
		const next = { ...items }
		for (const p of shown) next[p.id] = { ...optionsOf(p.id), categoryId: bulk }
		onChange(next)
	}

	return (
		<Card
			title={L("آپشن‌های هر پلن", "Per-plan options")}
			subtitle={L("دسته، برچسب، ویژگی‌ها، موجودی و سقف خرید هر پلن را مشخص کنید.", "Set category, ribbon, features, stock and purchase cap per plan.")}
			actions={<Button type="button" variant="primary" disabled={saving} onClick={onSave}><Save className="h-4 w-4" /> {L("ذخیره", "Save")}</Button>}
		>
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<div className="relative min-w-[11rem] flex-1">
						<Search className="pointer-events-none absolute top-1/2 end-3 h-4 w-4 -translate-y-1/2 text-muted" />
						<Input className="pe-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("جستجوی پلن…", "Search plans…")} />
					</div>
					<Select className="w-auto min-w-[10rem]" value={filter} onChange={(e) => setFilter(e.target.value)}>
						<option value="all">{L("همه پلن‌ها", "All plans")}</option>
						<option value="none">{L("بدون دسته", "Without category")}</option>
						{named.map((c) => (
							<option key={c.id} value={c.id}>{c.name}</option>
						))}
					</Select>
					<span className="num text-xs text-muted">{L("بدون دسته", "Unassigned")}: {formatNumber(unassigned, locale)}</span>
				</div>

				{named.length > 0 ? (
					<div className="glass-2 flex flex-wrap items-center gap-2 rounded-xl p-2 text-xs">
						<Wand2 className="h-4 w-4 text-violet" />
						<span className="text-muted">{L("اعمال گروهی دسته بر نتیجه‌های فیلتر شده:", "Apply a category to the filtered plans:")}</span>
						<Select className="w-auto min-w-[9rem]" value={bulk} onChange={(e) => setBulk(e.target.value)}>
							<option value="">{L("بدون دسته", "No category")}</option>
							{named.map((c) => (
								<option key={c.id} value={c.id}>{c.name}</option>
							))}
						</Select>
						<Button type="button" size="sm" variant="ghost" disabled={shown.length === 0} onClick={applyBulk}>{L("اعمال", "Apply")}</Button>
					</div>
				) : null}

				{plans.length === 0 ? (
					<Empty text={L("هنوز پلنی نساخته‌اید", "No plans yet")} />
				) : shown.length === 0 ? (
					<Empty text={L("با این فیلتر پلنی پیدا نشد", "No plans match this filter")} />
				) : (
					<div className="space-y-2">
						{shown.map((p) => {
							const o = optionsOf(p.id)
							const text = drafts[p.id] ?? o.features.join("\n")
							return (
								<div key={p.id} className="tile space-y-2 p-3">
									<div className="flex flex-wrap items-center gap-3">
										<div className="min-w-0 flex-1">
											<div className="truncate text-sm font-semibold">{p.name}</div>
											<div className="num text-xs text-muted">
												{formatNumber(p.price, locale)} {t("currency_irt")} · {p.trafficGB ? `${formatNumber(p.trafficGB, locale)} GB` : "∞"} · {p.days ? `${formatNumber(p.days, locale)} ${t("days")}` : "∞"} · {L("فروش", "Sold")} {formatNumber(p.sold, locale)}
											</div>
										</div>
										<label className="flex items-center gap-1.5 text-xs">
											<input type="checkbox" className="h-4 w-4" checked={o.highlight} onChange={(e) => set(p.id, { highlight: e.target.checked })} />
											{L("پیشنهاد ویژه", "Highlight")}
										</label>
										<label className="flex items-center gap-1.5 text-xs">
											<input type="checkbox" className="h-4 w-4" checked={o.hidden} onChange={(e) => set(p.id, { hidden: e.target.checked })} />
											{L("مخفی (فقط با لینک مستقیم)", "Hidden (direct link only)")}
										</label>
									</div>

									<div className="grid gap-2 md:grid-cols-4">
										<label className="block text-xs text-muted">
											{L("دسته", "Category")}
											<Select value={o.categoryId} onChange={(e) => set(p.id, { categoryId: e.target.value })}>
												<option value="">{L("بدون دسته", "No category")}</option>
												{named.map((c) => (
													<option key={c.id} value={c.id}>{c.name}</option>
												))}
											</Select>
										</label>
										<label className="block text-xs text-muted">
											{L("برچسب کارت", "Card ribbon")}
											<Input value={o.ribbon} onChange={(e) => set(p.id, { ribbon: e.target.value })} placeholder={L("مانند «بهترین انتخاب»", "e.g. Best value")} />
										</label>
										<label className="block text-xs text-muted">
											{L("موجودی (۰ = نامحدود)", "Stock (0 = unlimited)")}
											<Input type="number" min={0} value={o.stock} onChange={(e) => set(p.id, { stock: Math.max(0, Number(e.target.value) || 0) })} />
										</label>
										<label className="block text-xs text-muted">
											{L("سقف خرید هر حساب (۰ = نامحدود)", "Cap per account (0 = unlimited)")}
											<Input type="number" min={0} value={o.perCustomer} onChange={(e) => set(p.id, { perCustomer: Math.max(0, Number(e.target.value) || 0) })} />
										</label>
									</div>

									<div className="grid gap-2 md:grid-cols-2">
										<label className="block text-xs text-muted">
											{L("ویژگی‌ها — هر خط یک مورد (حداکثر ۸)", "Features — one per line (max 8)")}
											<Textarea
												rows={3}
												value={text}
												onChange={(e) => {
													setDrafts((d) => ({ ...d, [p.id]: e.target.value }))
													set(p.id, { features: parseLines(e.target.value) })
												}}
												placeholder={L("مناسب بازی\nپشتیبانی ۲۴ ساعته", "Great for gaming\n24/7 support")}
											/>
										</label>
										<label className="block text-xs text-muted">
											{L("یادداشت کوتاه روی کارت", "Short card note")}
											<Textarea rows={3} value={o.note} onChange={(e) => set(p.id, { note: e.target.value })} placeholder={L("مانند «تحویل فوری پس از پرداخت»", "e.g. Instant delivery")} />
										</label>
									</div>
								</div>
							)
						})}
					</div>
				)}
				<p className="text-xs text-muted">
					{L("موجودی بر اساس شمارندهٔ فروش همان پلن محاسبه می‌شود و سقف خرید فقط برای خریداران دارای حساب کاربری قابل اعمال است.", "Stock is compared with the plan's sold counter; the per-account cap only applies to buyers with an account.")}
				</p>
			</div>
		</Card>
	)
}
