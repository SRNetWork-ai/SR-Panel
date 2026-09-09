"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { api } from "@/lib/client"
import { formatDate } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Input, PageHeader, Spinner } from "@/components/ui"

type Row = { id: string; at: string; actor: string | null; action: string; target: string | null; meta: unknown; ip: string | null }
const TAKE = 50

function tone(action: string): "success" | "warning" | "danger" | "muted" | "violet" | "cyan" {
	if (action.endsWith("delete") || action.endsWith("login_failed") || action.endsWith("totp_disabled")) return "danger"
	if (action.endsWith("create") || action.endsWith("totp_enabled")) return "success"
	if (action.startsWith("auth.")) return "cyan"
	if (action.endsWith("reset_traffic")) return "warning"
	return "violet"
}

export function AuditClient() {
	const t = useT()
	const locale = useLocale()
	const [rows, setRows] = useState<Row[]>([])
	const [total, setTotal] = useState(0)
	const [q, setQ] = useState("")
	const [page, setPage] = useState(0)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		let alive = true
		const h = setTimeout(async () => {
			setLoading(true)
			try {
				const r = await api<{ items: Row[]; total: number }>(`/api/audit?q=${encodeURIComponent(q)}&take=${TAKE}&skip=${page * TAKE}`)
				if (!alive) return
				setRows(r.items)
				setTotal(r.total)
			} finally {
				if (alive) setLoading(false)
			}
		}, q ? 300 : 0)
		return () => { alive = false; clearTimeout(h) }
	}, [q, page])

	const pages = Math.max(1, Math.ceil(total / TAKE))

	return (
		<div>
			<PageHeader title={t("au_title")} subtitle={t("au_sub")} />
			<div className="mb-4 flex items-center gap-2">
				<div className="relative flex-1">
					<Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted" />
					<Input className="ps-10" placeholder={t("search")} value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} />
				</div>
				{loading && <Spinner />}
			</div>

			<Card bodyClassName="px-0 pb-0">
				{rows.length === 0 && !loading ? <Empty /> : (
					<div className="table-wrap">
						<table className="table">
							<thead><tr><th>{t("au_time")}</th><th>{t("au_actor")}</th><th>{t("au_action")}</th><th>{t("au_target")}</th><th>IP</th><th>{t("au_meta")}</th></tr></thead>
							<tbody>
								{rows.map((r) => (
									<tr key={r.id}>
										<td className="num whitespace-nowrap text-xs">{formatDate(r.at, locale, true)}</td>
										<td className="mono text-xs">{r.actor ?? <span className="text-muted">system</span>}</td>
										<td><Badge tone={tone(r.action)}>{r.action}</Badge></td>
										<td className="mono max-w-56 truncate text-xs">{r.target ?? "—"}</td>
										<td className="mono text-xs text-muted">{r.ip ?? "—"}</td>
										<td className="text-xs">
											{r.meta ? (
												<details>
													<summary className="cursor-pointer text-muted">JSON</summary>
													<pre className="mono mt-1 max-w-md overflow-x-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-2 text-[10px]" dir="ltr">{JSON.stringify(r.meta, null, 1)}</pre>
												</details>
											) : "—"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
				<div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-muted">
					<span className="num">{total} • {page + 1}/{pages}</span>
					<div className="flex gap-1">
						<Button size="icon" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronRight className="h-4 w-4 ltr:rotate-180" /></Button>
						<Button size="icon" variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}><ChevronLeft className="h-4 w-4 ltr:rotate-180" /></Button>
					</div>
				</div>
			</Card>
		</div>
	)
}
