import Link from "next/link"
import { dashboardStats } from "@srpanel/core"
import { requireAdmin } from "@/lib/auth"
import { currentLocale } from "@/lib/auth"
import { translate } from "@/lib/dict"
import { formatBytes, formatDate, formatNumber, percent } from "@/lib/format"
import { DashboardClient } from "./DashboardClient"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
	const admin = await requireAdmin()
	const locale = await currentLocale()
	const t = (k: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, k, vars)
	const stats = await dashboardStats(admin)

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="text-xl font-bold sm:text-2xl">
						{t("dash_welcome")}, <span className="neon-text">{admin.displayName || admin.username}</span> 👋
					</h1>
					<p className="mt-1 text-sm text-muted">{formatDate(new Date(), locale, true)}</p>
				</div>
				<div className="flex gap-2">
					<Link href="/clients?new=1" className="btn btn-primary">+ {t("cl_add")}</Link>
					{admin.role === "OWNER" && <Link href="/servers" className="btn">{t("nav_servers")}</Link>}
				</div>
			</div>

			<DashboardClient stats={stats} isOwner={admin.role === "OWNER"} />

			{/* quota (admins) */}
			{stats.quota && (
				<section className="glass fade-up p-5">
					<h3 className="mb-3 text-sm font-semibold">{t("dash_quota")}</h3>
					<div className="grid gap-4 sm:grid-cols-3">
						<div>
							<div className="mb-1 flex justify-between text-xs text-muted">
								<span>{t("dash_allocated")}</span>
								<span className="num">{formatBytes(stats.quota.allocated)}{stats.quota.trafficQuota ? ` / ${formatBytes(stats.quota.trafficQuota)}` : ""}</span>
							</div>
							<div className="progress"><span style={{ width: `${stats.quota.trafficQuota ? percent(stats.quota.allocated, stats.quota.trafficQuota) : 5}%` }} /></div>
						</div>
						<div>
							<div className="mb-1 flex justify-between text-xs text-muted">
								<span>{t("nav_clients")}</span>
								<span className="num">{formatNumber(stats.quota.clientCount, locale)}{stats.quota.clientLimit ? ` / ${formatNumber(stats.quota.clientLimit, locale)}` : ""}</span>
							</div>
							<div className="progress"><span style={{ width: `${stats.quota.clientLimit ? percent(stats.quota.clientCount, stats.quota.clientLimit) : 5}%` }} /></div>
						</div>
						<div className="text-xs text-muted">
							{t("ad_expires").split(" (")[0]}: <span className="text-fg">{stats.quota.expiresAt ? formatDate(stats.quota.expiresAt, locale) : t("never")}</span>
						</div>
					</div>
				</section>
			)}
		</div>
	)
}
