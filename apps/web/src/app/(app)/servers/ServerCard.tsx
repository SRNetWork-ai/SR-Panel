"use client"

import { ArrowDown, ArrowUp, Cpu, HardDrive, Pencil, RefreshCw, Trash2 } from "lucide-react"
import type { ServerDto } from "@/lib/dto"
import { formatBytes, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Progress, StatusBadge, cx } from "@/components/ui"
import { CopyBtn } from "@/components/bits"
import { tr } from "./types"

export function ServerCard({
	s,
	syncing,
	onSync,
	onEdit,
	onRemove,
}: {
	s: ServerDto
	syncing: boolean
	onSync: () => void
	onEdit: () => void
	onRemove: () => void
}) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const enabledInbounds = s.inbounds.filter((i) => i.enable).length

	return (
		<Card className={cx("sheen h-full", !s.isActive && "opacity-60")}>
			<div className="mb-3 flex items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-1.5">
						<h3 className="truncate font-semibold">{s.name}</h3>
						{s.authMode === "token" && <Badge tone="cyan">API</Badge>}
						{s.panelVersion && <Badge tone="violet">v{s.panelVersion}</Badge>}
						{!s.isActive && <Badge>{t("inactive")}</Badge>}
					</div>
					<div className="mt-0.5 flex items-center gap-1">
						<span className="mono truncate text-[11px] text-muted" title={s.baseUrl}>{s.baseUrl}</span>
						<CopyBtn value={s.baseUrl} />
					</div>
				</div>
				<StatusBadge status={s.status} />
			</div>

			<div className="mb-3 grid grid-cols-2 gap-3 text-[11px] text-muted">
				<div>
					<div className="mb-0.5 flex items-center justify-between">
						<span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{t("cpu")}</span>
						<span className="num">{s.stats?.cpu != null ? `${Math.round(s.stats.cpu)}%` : "—"}</span>
					</div>
					<Progress value={s.stats?.cpu ?? 0} />
				</div>
				<div>
					<div className="mb-0.5 flex items-center justify-between">
						<span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{t("memory")}</span>
						<span className="num">{s.stats?.memPct != null ? `${s.stats.memPct}%` : "—"}</span>
					</div>
					<Progress value={s.stats?.memPct ?? 0} />
				</div>
			</div>

			<dl className="mb-3 grid grid-cols-4 gap-2 text-center text-[11px]">
				<div className="tile p-2">
					<dt className="text-muted">{t("srv_inbounds")}</dt>
					<dd className="num font-semibold">{enabledInbounds}/{s.inbounds.length}</dd>
				</div>
				<div className="tile p-2">
					<dt className="text-muted">{t("nav_clients")}</dt>
					<dd className="num font-semibold">{s.clientCount ?? 0}</dd>
				</div>
				<div className="tile p-2">
					<dt className="text-muted">{t("srv_weight")}</dt>
					<dd className="num font-semibold">{s.weight}</dd>
				</div>
				<div className="tile p-2">
					<dt className="text-muted">Xray</dt>
					<dd className="num truncate font-semibold">{s.stats?.xrayVersion ?? "—"}</dd>
				</div>
			</dl>

			{s.inbounds.length > 0 && (
				<div className="mb-3 flex flex-wrap gap-1">
					{s.inbounds.slice(0, 6).map((i) => (
						<Badge key={i.id} tone={i.enable ? "violet" : "muted"}>{i.protocol} • {i.port}{i.remark ? ` • ${i.remark}` : ""}</Badge>
					))}
					{s.inbounds.length > 6 && <Badge>+{s.inbounds.length - 6}</Badge>}
				</div>
			)}

			{s.stats && (
				<div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
					<span className="inline-flex items-center gap-1"><ArrowUp className="h-3 w-3 text-cyan" />{formatBytes(s.stats.netUp, 0)}</span>
					<span className="inline-flex items-center gap-1"><ArrowDown className="h-3 w-3 text-violet-soft" />{formatBytes(s.stats.netDown, 0)}</span>
					{s.publicHost && <span className="mono truncate">{s.publicHost}</span>}
				</div>
			)}

			{s.lastError && (
				<div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger">
					{t("last_error")}: {s.lastError}
				</div>
			)}

			<div className="flex items-center justify-between gap-2">
				<span className="text-[11px] text-muted">{t("last_seen")}: {relativeTime(s.lastSeenAt, locale)}</span>
				<div className="flex gap-1">
					<Button type="button" size="icon" title={t("srv_sync")} onClick={onSync} loading={syncing}>{!syncing && <RefreshCw className="h-4 w-4" />}</Button>
					<Button type="button" size="icon" title={t("edit")} onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
					<Button type="button" size="icon" variant="danger" title={L("حذف سرور", "Delete server")} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
				</div>
			</div>
		</Card>
	)
}
