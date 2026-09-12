"use client"

import { useState } from "react"
import { Eye } from "lucide-react"
import { CopyBtn } from "@/components/bits"
import { Badge, Button, Empty, Modal, Spinner } from "@/components/ui"
import { formatDate } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { CATEGORIES, VERBS, categoryOf, toneOf, tr, verbOf, type AuditRow } from "./types"

export function AuditTable({ rows, loading }: { rows: AuditRow[]; loading: boolean }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const [open, setOpen] = useState<AuditRow | null>(null)
	const catLabel = (action: string) => {
		const c = CATEGORIES[categoryOf(action)] ?? CATEGORIES.other
		return tr(locale, c[0], c[1])
	}
	const verbLabel = (action: string) => {
		const v = VERBS[verbOf(action)]
		return v ? tr(locale, v[0], v[1]) : verbOf(action).replace(/_/g, " ")
	}

	if (rows.length === 0) {
		return loading ? (
			<div className="flex justify-center py-14">
				<Spinner />
			</div>
		) : (
			<Empty text={L("رویدادی با این فیلترها پیدا نشد", "No event matches these filters")} />
		)
	}

	return (
		<>
			<div className="table-wrap">
				<table className="table">
					<thead>
						<tr>
							<th>{t("au_time")}</th>
							<th>{L("دسته", "Category")}</th>
							<th>{t("au_action")}</th>
							<th>{t("au_actor")}</th>
							<th>{t("au_target")}</th>
							<th>IP</th>
							<th className="text-end">{t("au_meta")}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.id}>
								<td className="num whitespace-nowrap text-xs">{formatDate(r.at, locale, true)}</td>
								<td>
									<Badge tone="muted">{catLabel(r.action)}</Badge>
								</td>
								<td>
									<Badge tone={toneOf(r.action)}>{verbLabel(r.action)}</Badge>
									<div className="mono mt-0.5 text-[10px] text-muted" dir="ltr">
										{r.action}
									</div>
								</td>
								<td className="text-xs">
									{r.actor ?? <span className="text-muted">system</span>}
									{r.actorUsername && <span className="mono block text-[10px] text-muted">@{r.actorUsername}</span>}
								</td>
								<td className="mono max-w-56 truncate text-xs">{r.target ?? "—"}</td>
								<td className="mono text-xs text-muted" dir="ltr">
									{r.ip ?? "—"}
								</td>
								<td>
									<div className="flex justify-end">
										<Button size="icon" variant="ghost" type="button" title={t("au_meta")} onClick={() => setOpen(r)}>
											<Eye className="h-4 w-4" />
										</Button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{open && (
				<Modal
					open
					onClose={() => setOpen(null)}
					size="lg"
					title={`${catLabel(open.action)} • ${verbLabel(open.action)}`}
					subtitle={formatDate(open.at, locale, true)}
					footer={
						<Button type="button" onClick={() => setOpen(null)}>
							{L("بستن", "Close")}
						</Button>
					}
				>
					<div className="space-y-3">
						<div className="grid gap-2 sm:grid-cols-2">
							<div className="tile">
								<div className="text-[10px] text-muted">{t("au_action")}</div>
								<div className="mono flex items-center gap-1 text-xs" dir="ltr">
									{open.action}
									<CopyBtn value={open.action} />
								</div>
							</div>
							<div className="tile">
								<div className="text-[10px] text-muted">{t("au_actor")}</div>
								<div className="text-xs">{open.actor ?? "system"}{open.actorUsername ? ` (@${open.actorUsername})` : ""}</div>
							</div>
							<div className="tile">
								<div className="text-[10px] text-muted">{t("au_target")}</div>
								<div className="mono flex items-center gap-1 break-all text-xs" dir="ltr">
									{open.target ?? "—"}
									{open.target && <CopyBtn value={open.target} />}
								</div>
							</div>
							<div className="tile">
								<div className="text-[10px] text-muted">IP</div>
								<div className="mono text-xs" dir="ltr">
									{open.ip ?? "—"}
								</div>
							</div>
						</div>
						<div>
							<div className="mb-1 flex items-center justify-between text-[11px] text-muted">
								<span>{t("au_meta")}</span>
								{open.meta ? <CopyBtn value={JSON.stringify(open.meta, null, 2)} label={L("کپی JSON", "Copy JSON")} /> : null}
							</div>
							<pre className="mono scrollbar-thin max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-[11px]" dir="ltr">
								{open.meta ? JSON.stringify(open.meta, null, 2) : "—"}
							</pre>
						</div>
					</div>
				</Modal>
			)}
		</>
	)
}
