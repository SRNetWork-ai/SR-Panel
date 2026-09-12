import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { buildSubscription } from "@srpanel/core"
import { CalendarClock, Gauge, Server, Signal, Tag, Users } from "lucide-react"
import { formatBytes, formatDate, relativeTime } from "@/lib/format"
import { SubActions } from "./SubActions"
import { SubHelp } from "./SubHelp"
import { SubUsage } from "./SubUsage"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { token } = await params
	const p = await buildSubscription(token).catch(() => null)
	return { title: p ? p.brand.name + " • " + p.client.name : "Subscription", robots: { index: false, follow: false } }
}

const STATUS_FA: Record<string, string> = { ACTIVE: "فعال", DISABLED: "غیرفعال", EXPIRED: "منقضی شده", LIMITED: "حجم به پایان رسیده" }

export default async function SubscriptionPage({ params }: Props) {
	const { token } = await params
	const p = await buildSubscription(token)
	if (!p) notFound()

	const { client, brand, stats } = p
	const total = client.trafficLimit
	const pct = stats.usedPct
	const ok = client.status === "ACTIVE"
	const style = { "--brand-primary": brand.primaryColor, "--brand-accent": brand.accentColor } as React.CSSProperties

	const facts: Array<{ icon: React.ReactNode; label: string; value: string }> = [
		{ icon: <Tag className="h-3.5 w-3.5" />, label: "سرویس", value: client.serviceName || "—" },
		{ icon: <Users className="h-3.5 w-3.5" />, label: "اتصال هم‌زمان", value: client.ipLimit > 0 ? client.ipLimit + " دستگاه" : "بدون محدودیت" },
		{ icon: <CalendarClock className="h-3.5 w-3.5" />, label: "تاریخ شروع", value: formatDate(client.createdAt, "fa") },
		{ icon: <Signal className="h-3.5 w-3.5" />, label: "آخرین اتصال", value: client.lastOnlineAt ? relativeTime(client.lastOnlineAt) : "—" },
	]

	return (
		<div className="relative min-h-dvh px-4 py-8" style={style}>
			<div className="aurora" />
			<div className="mx-auto w-full max-w-lg space-y-4">
				<div className="fade-up flex flex-col items-center gap-2 text-center">
					{brand.logoUrl ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={brand.logoUrl} alt={brand.name} className="h-14 w-14 rounded-2xl object-cover" />
					) : (
						<div className="neon-ring flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-black text-white" style={{ background: "linear-gradient(135deg, var(--brand-primary), var(--brand-accent))" }}>
							{brand.name.slice(0, 1).toUpperCase()}
						</div>
					)}
					<h1 className="text-xl font-bold">{brand.name}</h1>
					{brand.tagline ? <p className="text-xs text-muted">{brand.tagline}</p> : null}
				</div>

				<section className="glass fade-up space-y-4 p-5">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<div className="text-xs text-muted">اشتراک</div>
							<div className="truncate text-lg font-semibold">{client.name}</div>
							{client.tag ? <div className="mono pt-0.5 text-[11px] text-muted">{client.tag}</div> : null}
						</div>
						<span className={ok ? "badge badge-success" : "badge badge-danger"}>{STATUS_FA[client.status] ?? client.status}</span>
					</div>

					<div>
						<div className="mb-1.5 flex items-center justify-between text-xs">
							<span className="text-muted">مصرف‌شده</span>
							<span className="num">{total > 0 ? formatBytes(client.usedBytes) + " / " + formatBytes(total) : formatBytes(client.usedBytes) + " • نامحدود"}</span>
						</div>
						<div className={"progress " + (pct >= 90 ? "danger" : pct >= 70 ? "warn" : "")}>
							<span style={{ width: (total > 0 ? pct : 8) + "%" }} />
						</div>
						<div className="flex items-center justify-between pt-1 text-[10px] text-muted">
							<span>ارسال {formatBytes(client.usedUp)}</span>
							<span>دریافت {formatBytes(client.usedDown)}</span>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<div className="glass glass-2 p-3">
							<div className="text-[11px] text-muted">باقی‌مانده</div>
							<div className="num text-base font-bold">{stats.remainingBytes === null ? "نامحدود" : formatBytes(stats.remainingBytes)}</div>
						</div>
						<div className="glass glass-2 p-3">
							<div className="text-[11px] text-muted">انقضا</div>
							<div className="num text-base font-bold">{client.expiresAt ? (stats.daysLeft !== null && stats.daysLeft > 0 ? stats.daysLeft + " روز" : "منقضی") : "همیشگی"}</div>
							{client.expiresAt ? <div className="text-[10px] text-muted">{formatDate(client.expiresAt, "fa")}</div> : null}
						</div>
						<div className="glass glass-2 p-3">
							<div className="text-[11px] text-muted">میانگین روزانه</div>
							<div className="num text-base font-bold">{formatBytes(stats.dailyAvgBytes)}</div>
						</div>
						<div className="glass glass-2 p-3">
							<div className="text-[11px] text-muted">۷ روز اخیر</div>
							<div className="num text-base font-bold">{formatBytes(stats.last7Bytes)}</div>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-2">
						{facts.map((f) => (
							<div key={f.label} className="flex items-center gap-2 text-[11px]">
								<span className="text-violet-soft">{f.icon}</span>
								<span className="text-muted">{f.label}:</span>
								<span className="truncate font-medium">{f.value}</span>
							</div>
						))}
					</div>
				</section>

				{p.servers.length ? (
					<section className="glass fade-up space-y-2 p-5">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2 text-sm font-semibold">
								<Server className="h-4 w-4 text-violet-soft" /> سرورهای شما
							</div>
							<span className="num text-xs text-muted">{p.links.length} کانفیگ</span>
						</div>
						<div className="grid gap-2 sm:grid-cols-2">
							{p.servers.map((sv) => (
								<div key={sv.name} className="glass glass-2 flex items-center justify-between gap-2 p-3">
									<div className="flex min-w-0 items-center gap-2">
										<span className={"h-2 w-2 shrink-0 rounded-full " + (sv.online ? "bg-success" : "bg-danger")} />
										<span className="truncate text-[13px]">{sv.name}</span>
									</div>
									<span className="num text-[11px] text-muted">{sv.configs}</span>
								</div>
							))}
						</div>
					</section>
				) : null}

				<SubUsage usage={p.usage} />

				<SubActions subUrl={p.subUrl} links={p.links} brandName={brand.name} supportUrl={brand.supportUrl} telegramUrl={brand.telegramUrl} />

				<SubHelp
					renewUrl={p.renewUrl}
					supportUrl={brand.supportUrl}
					telegramUrl={brand.telegramUrl}
					brandName={brand.name}
					daysLeft={stats.daysLeft}
					usedPct={pct}
					expired={!ok}
				/>

				<p className="flex items-center justify-center gap-1.5 pt-4 text-center text-[11px] text-muted">
					<Gauge className="h-3.5 w-3.5" /> Powered by SRPanel
				</p>
			</div>
		</div>
	)
}
