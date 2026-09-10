import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { buildSubscription } from "@srpanel/core"
import { formatBytes, formatDate, percent } from "@/lib/format"
import { SubActions } from "./SubActions"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { token } = await params
	const p = await buildSubscription(token).catch(() => null)
	return { title: p ? `${p.brand.name} • ${p.client.name}` : "Subscription", robots: { index: false, follow: false } }
}

const STATUS_FA: Record<string, string> = { ACTIVE: "فعال", DISABLED: "غیرفعال", EXPIRED: "منقضی شده", LIMITED: "حجم به پایان رسیده" }

export default async function SubscriptionPage({ params }: Props) {
	const { token } = await params
	const p = await buildSubscription(token)
	if (!p) notFound()

	const publicUrl = (process.env.SRP_PUBLIC_URL || "").replace(/\/+$/, "")
	const subUrl = `${publicUrl}/sub/${token}`
	const used = p.client.usedBytes
	const total = p.client.trafficLimit
	const pct = total > 0 ? percent(used, total) : 0
	const remaining = total > 0 ? Math.max(0, total - used) : null
	const daysLeft = p.client.expiresAt ? Math.ceil((new Date(p.client.expiresAt).getTime() - Date.now()) / 86_400_000) : null
	const ok = p.client.status === "ACTIVE"

	const style = { "--brand-primary": p.brand.primaryColor, "--brand-accent": p.brand.accentColor } as React.CSSProperties

	return (
		<div className="relative min-h-dvh px-4 py-8" style={style}>
			<div className="aurora" />
			<div className="mx-auto w-full max-w-md space-y-4">
				{/* brand */}
				<div className="fade-up flex flex-col items-center gap-2 text-center">
					{p.brand.logoUrl ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={p.brand.logoUrl} alt={p.brand.name} className="h-14 w-14 rounded-2xl object-cover" />
					) : (
						<div className="neon-ring flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-black text-white" style={{ background: `linear-gradient(135deg, var(--brand-primary), var(--brand-accent))` }}>
							{p.brand.name.slice(0, 1).toUpperCase()}
						</div>
					)}
					<h1 className="text-xl font-bold">{p.brand.name}</h1>
					{p.brand.tagline && <p className="text-xs text-muted">{p.brand.tagline}</p>}
				</div>

				{/* usage card */}
				<section className="glass fade-up space-y-4 p-5">
					<div className="flex items-center justify-between">
						<div>
							<div className="text-xs text-muted">اشتراک</div>
							<div className="text-lg font-semibold">{p.client.name}</div>
						</div>
						<span className={`badge ${ok ? "badge-success" : "badge-danger"}`}>{STATUS_FA[p.client.status] ?? p.client.status}</span>
					</div>

					<div>
						<div className="mb-1.5 flex items-center justify-between text-xs">
							<span className="text-muted">مصرف‌شده</span>
							<span className="num">{formatBytes(used)}{total > 0 ? ` / ${formatBytes(total)}` : " • نامحدود"}</span>
						</div>
						<div className={`progress ${pct >= 90 ? "danger" : pct >= 70 ? "warn" : ""}`}>
							<span style={{ width: `${total > 0 ? pct : 8}%` }} />
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="glass glass-2 p-3">
							<div className="text-[11px] text-muted">باقی‌مانده</div>
							<div className="num text-base font-bold">{remaining === null ? "نامحدود" : formatBytes(remaining)}</div>
						</div>
						<div className="glass glass-2 p-3">
							<div className="text-[11px] text-muted">انقضا</div>
							<div className="num text-base font-bold">
								{p.client.expiresAt ? (daysLeft !== null && daysLeft > 0 ? `${daysLeft} روز` : "منقضی") : "همیشگی"}
							</div>
							{p.client.expiresAt && <div className="text-[10px] text-muted">{formatDate(p.client.expiresAt, "fa")}</div>}
						</div>
					</div>
				</section>

				<SubActions subUrl={subUrl} links={p.links} brandName={p.brand.name} supportUrl={p.brand.supportUrl} telegramUrl={p.brand.telegramUrl} />

				<p className="pt-4 text-center text-[11px] text-muted">Powered by SRPanel</p>
			</div>
		</div>
	)
}
