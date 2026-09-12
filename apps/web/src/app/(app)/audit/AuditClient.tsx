"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Download, RefreshCw, Search } from "lucide-react"
import { Button, Card, Field, Input, PageHeader, Select, Spinner, cx } from "@/components/ui"
import { api } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { AuditTable } from "./AuditTable"
import { CATEGORIES, PAGE_SIZES, csvOf, tr, type AuditResponse, type AuditRow, type Facet } from "./types"

export function AuditClient() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const [rows, setRows] = useState<AuditRow[]>([])
	const [facets, setFacets] = useState<Facet[]>([])
	const [total, setTotal] = useState(0)
	const [q, setQ] = useState("")
	const [category, setCategory] = useState("")
	const [from, setFrom] = useState("")
	const [to, setTo] = useState("")
	const [take, setTake] = useState(50)
	const [page, setPage] = useState(0)
	const [tick, setTick] = useState(0)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		let alive = true
		const h = setTimeout(async () => {
			setLoading(true)
			try {
				const sp = new URLSearchParams({ take: String(take), skip: String(page * take) })
				if (q.trim()) sp.set("q", q.trim())
				if (category) sp.set("category", category)
				if (from) sp.set("from", from)
				if (to) sp.set("to", to)
				const r = await api<AuditResponse>(`/api/audit?${sp.toString()}`)
				if (!alive) return
				setRows(r.items)
				setTotal(r.total)
				setFacets(r.facets)
			} finally {
				if (alive) setLoading(false)
			}
		}, q ? 300 : 0)
		return () => {
			alive = false
			clearTimeout(h)
		}
	}, [q, category, from, to, take, page, tick])

	const pages = Math.max(1, Math.ceil(total / take))
	const dirty = Boolean(q || category || from || to)
	const chips = useMemo(() => [{ id: "", count: facets.reduce((s, f) => s + f.count, 0) }, ...facets], [facets])
	const label = (id: string) => {
		if (!id) return t("all")
		const c = CATEGORIES[id]
		return c ? tr(locale, c[0], c[1]) : id
	}

	const pick = (id: string) => {
		setCategory(id)
		setPage(0)
	}

	const exportCsv = () => {
		const blob = new Blob([csvOf(rows)], { type: "text/csv;charset=utf-8" })
		const url = URL.createObjectURL(blob)
		const a = document.createElement("a")
		a.href = url
		a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`
		a.click()
		URL.revokeObjectURL(url)
	}

	return (
		<div className="space-y-4">
			<PageHeader
				title={t("au_title")}
				subtitle={t("au_sub")}
				actions={
					<>
						<Button type="button" variant="ghost" onClick={() => setTick((x) => x + 1)} loading={loading}>
							<RefreshCw className="h-4 w-4" />
							{t("refresh")}
						</Button>
						<Button type="button" onClick={exportCsv} disabled={rows.length === 0}>
							<Download className="h-4 w-4" />
							CSV
						</Button>
					</>
				}
			/>

			<Card bodyClassName="space-y-3">
				<div className="flex flex-wrap items-end gap-2">
					<div className="relative min-w-52 flex-1">
						<Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted" />
						<Input
							className="ps-10"
							placeholder={L("جستجو در رویداد، هدف، کاربر یا IP…", "Search action, target, actor or IP…")}
							value={q}
							onChange={(e) => {
								setQ(e.target.value)
								setPage(0)
							}}
						/>
					</div>
					<Field label={L("از تاریخ", "From")} className="w-36">
						<Input type="date" className="text-start" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0) }} />
					</Field>
					<Field label={L("تا تاریخ", "To")} className="w-36">
						<Input type="date" className="text-start" value={to} onChange={(e) => { setTo(e.target.value); setPage(0) }} />
					</Field>
					<Select
						className="w-auto"
						value={take}
						onChange={(e) => {
							setTake(Number(e.target.value))
							setPage(0)
						}}
					>
						{PAGE_SIZES.map((n) => (
							<option key={n} value={n}>
								{L(`${formatNumber(n, locale)} ردیف`, `${n} rows`)}
							</option>
						))}
					</Select>
					{dirty && (
						<Button
							type="button"
							variant="ghost"
							onClick={() => {
								setQ("")
								setCategory("")
								setFrom("")
								setTo("")
								setPage(0)
							}}
						>
							{L("پاک کردن فیلترها", "Clear filters")}
						</Button>
					)}
				</div>
				<div className="flex flex-wrap gap-1.5">
					{chips.map((c) => (
						<button key={c.id || "all"} type="button" onClick={() => pick(c.id)} className={cx("chip", category === c.id && "chip-on")}>
							{label(c.id)}
							<span className="num text-[10px] text-muted">{formatNumber(c.count, locale)}</span>
						</button>
					))}
				</div>
			</Card>

			<Card bodyClassName="px-0 pb-0">
				<AuditTable rows={rows} loading={loading} />
				<div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2 text-xs text-muted">
					<span className="num flex items-center gap-2">
						{formatNumber(total, locale)} • {formatNumber(page + 1, locale)}/{formatNumber(pages, locale)}
						{loading && rows.length > 0 && <Spinner className="h-3.5 w-3.5" />}
					</span>
					<div className="flex gap-1">
						<Button size="icon" variant="ghost" type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
							<ChevronRight className="h-4 w-4 ltr:rotate-180" />
						</Button>
						<Button size="icon" variant="ghost" type="button" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
							<ChevronLeft className="h-4 w-4 ltr:rotate-180" />
						</Button>
					</div>
				</div>
			</Card>
		</div>
	)
}
