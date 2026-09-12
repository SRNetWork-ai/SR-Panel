"use client"

import { KeyRound, Layers, Pencil, Power, Trash2 } from "lucide-react"
import { CopyBtn } from "@/components/bits"
import { Badge, Button, Progress, cx } from "@/components/ui"
import type { AdminDto } from "@/lib/dto"
import { formatBytes, formatDate, formatNumber, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { daysLeft, isPublic, quotaPct, servicesOf, tr, type ServerLite, type ServiceLite } from "./types"

export function AdminCard({
	admin: a,
	services,
	servers,
	selfId,
	onEdit,
	onToggle,
	onDelete,
}: {
	admin: AdminDto
	services: ServiceLite[]
	servers: ServerLite[]
	selfId: string
	onEdit: () => void
	onToggle: () => void
	onDelete: () => void
}) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const owner = a.role === "OWNER"
	const mine = servicesOf(services, a.id)
	const shared = services.filter(isPublic)
	const legacy = a.serverAccess ?? []
	const left = daysLeft(a.expiresAt)
	const pct = quotaPct(a)
	const initials = (a.displayName || a.username).trim().slice(0, 2).toUpperCase()

	return (
		<div className={cx("glass glass-2 flex h-full flex-col gap-3 p-4", !a.isActive && "opacity-70")}>
			<div className="flex items-start gap-3">
				<div className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-semibold", owner ? "bg-violet-500/15 text-violet-300" : "bg-cyan-500/15 text-cyan-300")}>{initials}</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="truncate font-semibold">{a.displayName || a.username}</span>
						<Badge tone={owner ? "violet" : "cyan"}>{owner ? t("owner") : t("admin")}</Badge>
						<Badge tone={a.isActive ? "success" : "muted"}>{a.isActive ? t("active") : t("inactive")}</Badge>
						{a.totpEnabled && <KeyRound className="h-3.5 w-3.5 text-success" />}
						{!owner && left !== null && left <= 7 && <Badge tone={left <= 0 ? "danger" : "warning"}>{left <= 0 ? L("منقضی", "expired") : L(`${formatNumber(left, locale)} روز`, `${left}d left`)}</Badge>}
					</div>
					<div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
						<span className="mono truncate">@{a.username}</span>
						<CopyBtn value={a.username} title={L("کپی نام کاربری", "Copy username")} />
						{a.telegramId && <span className="mono truncate">• {a.telegramId}</span>}
					</div>
				</div>
			</div>

			<div>
				<div className="mb-1 flex items-center justify-between text-[11px] text-muted">
					<span>{t("ad_quota")}</span>
					<span className="num">
						{formatBytes(a.allocatedBytes ?? 0)} / {owner || !a.trafficQuota ? "∞" : formatBytes(a.trafficQuota)}
					</span>
				</div>
				<Progress value={owner ? 0 : pct} />
				<div className="mt-1 text-[10px] text-muted">
					{t("ad_used")}: <span className="num">{formatBytes(a.usedBytes ?? 0)}</span> • {t("ad_last_login")}: {relativeTime(a.lastLoginAt, locale)}
				</div>
			</div>

			<div className="grid grid-cols-3 gap-2">
				<div className="tile">
					<div className="text-[10px] text-muted">{t("nav_clients")}</div>
					<div className="num text-sm font-semibold">
						{formatNumber(a.clientCount ?? 0, locale)}
						{a.clientLimit ? <span className="text-[10px] text-muted"> / {formatNumber(a.clientLimit, locale)}</span> : null}
					</div>
				</div>
				<div className="tile">
					<div className="text-[10px] text-muted">{L("سرویس‌ها", "Services")}</div>
					<div className="num text-sm font-semibold">{owner ? t("all") : formatNumber(mine.length + shared.length, locale)}</div>
				</div>
				<div className="tile">
					<div className="text-[10px] text-muted">{t("ad_expires")}</div>
					<div className="text-[11px] font-semibold">{a.expiresAt ? formatDate(a.expiresAt, locale) : <span className="text-muted">{t("never")}</span>}</div>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-1">
				<Layers className="h-3.5 w-3.5 shrink-0 text-muted" />
				{owner ? (
					<span className="text-[11px] text-muted">{L("دسترسی کامل به همهٔ سرویس‌ها", "Full access to every service")}</span>
				) : (
					<>
						{mine.length === 0 && shared.length === 0 && <span className="text-[11px] text-muted">{L("سرویسی تعیین نشده", "No service assigned")}</span>}
						{mine.slice(0, 4).map((s) => (
							<Badge key={s.id} tone={s.isActive ? "violet" : "muted"}>
								{s.name}
							</Badge>
						))}
						{mine.length > 4 && <Badge tone="muted">+{formatNumber(mine.length - 4, locale)}</Badge>}
						{shared.length > 0 && <Badge tone="cyan">{L(`${formatNumber(shared.length, locale)} سرویس عمومی`, `${shared.length} shared`)}</Badge>}
					</>
				)}
			</div>

			{!owner && legacy.length > 0 && (
				<p className="text-[10px] text-muted">
					{L("دسترسی قدیمی سرور/اینباند", "Legacy server access")}: {legacy.map((x) => servers.find((s) => s.id === x.serverId)?.name ?? "?").join(" • ")}
				</p>
			)}

			<div className="mt-auto flex items-center justify-end gap-1 border-t border-white/5 pt-3">
				{!owner && (
					<Button size="icon" variant="ghost" type="button" title={a.isActive ? t("inactive") : t("active")} onClick={onToggle}>
						<Power className={cx("h-4 w-4", a.isActive ? "text-success" : "text-muted")} />
					</Button>
				)}
				<Button size="icon" variant="ghost" type="button" title={t("edit")} onClick={onEdit} disabled={owner && a.id !== selfId}>
					<Pencil className="h-4 w-4" />
				</Button>
				{!owner && (
					<Button size="icon" variant="danger" type="button" title={t("delete")} onClick={onDelete}>
						<Trash2 className="h-4 w-4" />
					</Button>
				)}
			</div>
		</div>
	)
}
