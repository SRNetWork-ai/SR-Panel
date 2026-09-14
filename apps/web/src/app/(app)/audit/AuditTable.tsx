"use client"

import { useState } from "react"
import { Eye } from "lucide-react"
import { Badge, Button, Empty, Modal, Spinner } from "@/components/ui"
import { CopyBtn } from "@/components/bits"
import { formatDate } from "@/lib/format"
import { useLocale } from "@/lib/i18n"
import { LEVEL_LABELS, LEVEL_TONE, SOURCE_LABELS, SOURCE_TONE, actionLabel, tr, type LogRow } from "./types"

const Line = ({ label, value }: { label: string; value: string }) => (
	<div className="flex items-start justify-between gap-3 border-b border-line py-1.5 last:border-0">
		<span className="shrink-0 text-xs text-muted">{label}</span>
		<span className="mono break-all text-end text-xs">{value}</span>
	</div>
)

export function AuditTable({ rows, loading }: { rows: LogRow[]; loading: boolean }) {
	const locale = useLocale()
	const [open, setOpen] = useState<LogRow | null>(null)
	const L = (fa: string, en: string) => tr(locale, fa, en)

	if (loading && rows.length === 0)
		return (
			<div className="flex justify-center py-10">
				<Spinner />
			</div>
		)

	if (rows.length === 0)
		return (
			<div className="py-8">
				<Empty text={L("رویدادی با این فیلترها پیدا نشد", "No log entries for these filters")} />
			</div>
		)

	return (
		<>
			<div className="table-wrap scrollbar-thin">
				<table className="table">
					<thead>
						<tr>
							<th>{L("زمان", "Time")}</th>
							<th>{L("منبع", "Source")}</th>
							<th>{L("سطح", "Level")}</th>
							<th>{L("رویداد", "Event")}</th>
							<th>{L("کاربر", "Actor")}</th>
							<th>{L("هدف / توضیح", "Target / details")}</th>
							<th>IP</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.id}>
								<td className="num whitespace-nowrap text-xs">{formatDate(r.at, locale, true)}</td>
								<td>
									<Badge tone={SOURCE_TONE[r.source]}>{tr(locale, SOURCE_LABELS[r.source][0], SOURCE_LABELS[r.source][1])}</Badge>
								</td>
								<td>
									<Badge tone={LEVEL_TONE[r.level]}>{tr(locale, LEVEL_LABELS[r.level][0], LEVEL_LABELS[r.level][1])}</Badge>
								</td>
								<td className="max-w-56">
									<div className="truncate text-xs">{actionLabel(locale, r.action)}</div>
									<div className="mono truncate text-[10px] text-muted">{r.action}</div>
								</td>
								<td className="whitespace-nowrap text-xs">{r.actor ?? "—"}</td>
								<td className="max-w-72">
									<div className="mono truncate text-xs">{r.target ?? "—"}</div>
									{r.text ? <div className="truncate text-[11px] text-muted">{r.text}</div> : null}
								</td>
								<td className="mono text-xs">{r.ip ?? "—"}</td>
								<td className="text-end">
									<Button type="button" size="icon" variant="ghost" onClick={() => setOpen(r)} title={L("جزئیات", "Details")}>
										<Eye className="h-4 w-4" />
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{open ? (
				<Modal
					open
					onClose={() => setOpen(null)}
					title={actionLabel(locale, open.action)}
					subtitle={`${tr(locale, SOURCE_LABELS[open.source][0], SOURCE_LABELS[open.source][1])} • ${formatDate(open.at, locale, true)}`}
					size="lg"
					footer={<CopyBtn value={JSON.stringify(open.meta ?? {}, null, 2)} label={L("کپی JSON", "Copy JSON")} />}
				>
					<div className="space-y-3">
						<div className="tile p-3">
							<Line label={L("شناسه", "ID")} value={open.id} />
							<Line label={L("رویداد", "Action")} value={open.action} />
							<Line label={L("سطح", "Level")} value={tr(locale, LEVEL_LABELS[open.level][0], LEVEL_LABELS[open.level][1])} />
							<Line label={L("کاربر", "Actor")} value={open.actor ?? "—"} />
							<Line label={L("هدف", "Target")} value={open.target ?? "—"} />
							<Line label="IP" value={open.ip ?? "—"} />
							{open.text ? <Line label={L("توضیح", "Details")} value={open.text} /> : null}
						</div>
						<pre className="mono scrollbar-thin max-h-72 overflow-auto rounded-xl bg-black/20 p-3 text-[11px] leading-5" dir="ltr">
							{JSON.stringify(open.meta ?? {}, null, 2)}
						</pre>
					</div>
				</Modal>
			) : null}
		</>
	)
}
