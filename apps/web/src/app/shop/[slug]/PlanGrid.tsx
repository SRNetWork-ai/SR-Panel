"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Check, Clock, Flame, MapPin, Server, Users, Wifi } from "lucide-react"
import { formatNumber } from "@/lib/format"
import { UNLIMITED, type PublicPlan } from "./types"

/** Sort/filter toolbar + rich plan cards of the public storefront. */

type Sort = "default" | "cheap" | "popular" | "traffic"

const SORTS: { id: Sort; label: string }[] = [
	{ id: "default", label: "پیشنهاد فروشگاه" },
	{ id: "cheap", label: "ارزان‌ترین" },
	{ id: "popular", label: "پرفروش‌ترین" },
	{ id: "traffic", label: "بیشترین حجم" },
]

export function PlanGrid({ plans, selectedId, currency, onSelect }: { plans: PublicPlan[]; selectedId: string | null; currency: string; onSelect: (p: PublicPlan) => void }) {
	const [sort, setSort] = useState<Sort>("default")
	const [days, setDays] = useState<number | null>(null)

	const durations = useMemo(() => [...new Set(plans.map((p) => p.days).filter((d) => d > 0))].sort((a, b) => a - b), [plans])

	const popularId = useMemo(() => {
		let best: PublicPlan | null = null
		for (const p of plans) if (p.sold > 0 && (best === null || p.sold > best.sold)) best = p
		return best === null ? null : best.id
	}, [plans])

	const list = useMemo(() => {
		const filtered = plans.filter((p) => days === null || p.days === days)
		const cmp: Record<Sort, (a: PublicPlan, b: PublicPlan) => number> = {
			default: () => 0,
			cheap: (a, b) => Number(a.price) - Number(b.price),
			popular: (a, b) => b.sold - a.sold,
			traffic: (a, b) => (b.trafficGB || 1e6) - (a.trafficGB || 1e6),
		}
		return [...filtered].sort(cmp[sort])
	}, [plans, days, sort])

	if (plans.length === 0) return <div className="glass p-8 text-center text-sm text-muted">فعلاً پلنی برای فروش وجود ندارد. برای مشاوره با پشتیبانی در تماس باشید.</div>

	return (
		<div className="space-y-4">
			{durations.length > 1 || plans.length > 2 ? (
				<div className="glass-2 flex flex-wrap items-center gap-3 rounded-2xl p-3">
					{durations.length > 1 ? (
						<div className="flex flex-wrap items-center gap-1">
							<span className="me-1 text-[11px] text-muted">مدت:</span>
							<Chip on={days === null} onClick={() => setDays(null)}>همه</Chip>
							{durations.map((d) => (
								<Chip key={d} on={days === d} onClick={() => setDays(d)}>{formatNumber(d, "fa")} روز</Chip>
							))}
						</div>
					) : null}
					<div className="flex flex-wrap items-center gap-1 sm:ms-auto">
						<span className="me-1 text-[11px] text-muted">ترتیب:</span>
						{SORTS.map((s) => (
							<Chip key={s.id} on={sort === s.id} onClick={() => setSort(s.id)}>{s.label}</Chip>
						))}
					</div>
				</div>
			) : null}

			{list.length === 0 ? (
				<div className="glass p-8 text-center text-sm text-muted">با این فیلتر پلنی پیدا نشد.</div>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{list.map((p) => (
						<PlanCard key={p.id} plan={p} on={selectedId === p.id} popular={popularId === p.id} currency={currency} onSelect={onSelect} />
					))}
				</div>
			)}
		</div>
	)
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
	return (
		<button type="button" onClick={onClick} className={"rounded-full px-3 py-1 text-xs transition " + (on ? "bg-violet/30 text-white" : "text-muted hover:bg-white/5")}>
			{children}
		</button>
	)
}

function PlanCard({ plan: p, on, popular, currency, onSelect }: { plan: PublicPlan; on: boolean; popular: boolean; currency: string; onSelect: (p: PublicPlan) => void }) {
	const price = Number(p.price)
	const old = p.oldPrice ? Number(p.oldPrice) : 0
	const off = old > price ? Math.round((1 - price / old) * 100) : 0
	return (
		<button type="button" onClick={() => onSelect(p)} className={"glass relative flex flex-col gap-3 p-5 text-start transition " + (on ? "neon-ring bg-violet/15" : "hover:bg-white/5")}>
			<div className="absolute -top-2 start-4 flex flex-wrap gap-1">
				{p.badge ? <span className="badge bg-violet/40 text-white">{p.badge}</span> : null}
				{popular ? <span className="badge bg-magenta/30 text-white"><Flame className="h-3 w-3" /> پرفروش</span> : null}
			</div>

			<div className="flex items-start justify-between gap-2 pt-1">
				<div>
					<div className="font-semibold">{p.name}</div>
					{p.serviceName ? <div className="text-[11px] text-muted">{p.serviceName}</div> : null}
				</div>
				{on ? <Check className="h-5 w-5 shrink-0 text-cyan" /> : null}
			</div>

			<div className="flex flex-wrap items-baseline gap-2">
				<span className="num text-2xl font-bold">{formatNumber(price, "fa")}</span>
				<span className="text-xs text-muted">{currency}</span>
				{old > price ? <span className="num text-xs text-muted line-through">{formatNumber(old, "fa")}</span> : null}
				{off > 0 ? <span className="badge bg-success/20 text-success">{formatNumber(off, "fa")}٪ تخفیف</span> : null}
			</div>
			{p.priceUsdt ? <div className="mono text-[11px] text-muted" dir="ltr">≈ {p.priceUsdt} USDT</div> : null}

			<div className="grid grid-cols-3 gap-2 text-center text-xs">
				<div className="glass-2 rounded-xl p-2"><Wifi className="mx-auto mb-1 h-3.5 w-3.5 text-cyan" /><div className="num font-semibold">{p.trafficGB ? formatNumber(p.trafficGB, "fa") + " GB" : UNLIMITED}</div></div>
				<div className="glass-2 rounded-xl p-2"><Clock className="mx-auto mb-1 h-3.5 w-3.5 text-violet" /><div className="num font-semibold">{p.days ? formatNumber(p.days, "fa") + " روز" : UNLIMITED}</div></div>
				<div className="glass-2 rounded-xl p-2"><Users className="mx-auto mb-1 h-3.5 w-3.5 text-magenta" /><div className="num font-semibold">{p.ipLimit ? formatNumber(p.ipLimit, "fa") + " کاربر" : UNLIMITED}</div></div>
			</div>

			{p.description ? <p className="text-xs leading-5 text-muted">{p.description}</p> : null}

			{p.locations.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{p.locations.slice(0, 3).map((l) => (
						<span key={l} className="badge bg-white/5 text-muted"><MapPin className="h-3 w-3" /> {l}</span>
					))}
					{p.locations.length > 3 ? <span className="badge bg-white/5 text-muted">+{formatNumber(p.locations.length - 3, "fa")}</span> : null}
				</div>
			) : null}

			<div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
				{p.pricePerDay ? <span className="num">روزانه ≈ {formatNumber(p.pricePerDay, "fa")} {currency}</span> : null}
				{p.servers > 0 ? <span className="inline-flex items-center gap-1"><Server className="h-3 w-3" /> {formatNumber(p.servers, "fa")} سرور</span> : null}
				{p.sold > 0 ? <span className="num">{formatNumber(p.sold, "fa")} فروش</span> : null}
			</div>
		</button>
	)
}
