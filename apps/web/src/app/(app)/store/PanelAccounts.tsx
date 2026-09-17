"use client"

import { useMemo, useState } from "react"
import { Clock, KeyRound, Search, Users } from "lucide-react"
import { api } from "@/lib/client"
import { formatDate, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Input, useToast } from "@/components/ui"
import { CopyBtn } from "./parts"
import { tr } from "./types"

/** a sub-panel this admin sold, enriched with the live account state */
export type PanelAccount = {
	adminId: string
	username: string
	planId: string
	planName: string
	buyerRef: string
	orderId: string
	lastOrderId: string
	createdAt: string
	lastAt: string
	renewals: number
	exists: boolean
	isActive: boolean
	expiresAt: string
	quotaGB: number | null
	clientLimit: number | null
	clients: number
	credit: string
}

export type PanelCreds = { username: string; password: string; loginUrl: string }

/**
 * ساب‌ادمین‌ها فقط با مالک پنل ویرایش می‌شوند، پس فروشنده فقط اینجا
 * می‌تواند گذرواژهٔ زیرپنلی که فروخته را بازنشانی کند.
 */
export function PanelAccounts({ accounts, onCreds, onReload }: { accounts: PanelAccount[]; onCreds: (creds: PanelCreds) => void; onReload: () => void }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [busy, setBusy] = useState("")
	const [q, setQ] = useState("")

	const shown = useMemo(() => {
		const needle = q.trim().toLowerCase()
		if (!needle) return accounts
		return accounts.filter((a) => a.username.toLowerCase().includes(needle) || a.buyerRef.toLowerCase().includes(needle) || a.planName.toLowerCase().includes(needle))
	}, [accounts, q])

	async function resetPassword(a: PanelAccount) {
		setBusy(a.adminId)
		try {
			onCreds(await api<PanelCreds>("/api/settings/panel-plans", { method: "POST", json: { adminId: a.adminId } }))
			onReload()
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setBusy("")
		}
	}

	return (
		<Card
			title={<span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> {L("زیرپنل‌های فروخته‌شده", "Sold sub-panels")}</span>}
			subtitle={L("هر خریدار یک پنل نمایندگی مستقل دارد", "Every buyer owns an independent reseller panel")}
			actions={
				<div className="relative">
					<Search className="pointer-events-none absolute top-1/2 end-3 h-4 w-4 -translate-y-1/2 text-muted" />
					<Input className="pe-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("جستجو", "Search")} />
				</div>
			}
		>
			{shown.length === 0 ? (
				<Empty text={L("هنوز زیرپنلی فروخته نشده است", "No sub-panel sold yet")} />
			) : (
				<div className="table-wrap">
					<table className="table">
						<thead>
							<tr>
								<th>{L("نام کاربری", "Username")}</th>
								<th>{L("پلن / خریدار", "Plan / buyer")}</th>
								<th>{L("ترافیک", "Traffic")}</th>
								<th>{L("کاربران", "Clients")}</th>
								<th>{L("انقضا", "Expiry")}</th>
								<th>{t("status")}</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{shown.map((a) => (
								<tr key={a.adminId}>
									<td className="mono font-semibold">
										<span className="inline-flex items-center gap-1">{a.username}<CopyBtn value={a.username} /></span>
										{a.renewals > 0 && <div className="text-xs text-muted">{L("شارژ", "Top-ups")}: {formatNumber(a.renewals, locale)}</div>}
									</td>
									<td>
										<div>{a.planName || "—"}</div>
										<div className="text-xs text-muted">{a.buyerRef || "—"}</div>
									</td>
									<td className="num">{a.quotaGB === null ? L("نامحدود", "Unlimited") : `${formatNumber(a.quotaGB, locale)} ${L("گیگ", "GB")}`}</td>
									<td className="num">
										{formatNumber(a.clients, locale)}
										{a.clientLimit === null ? " / ∞" : ` / ${formatNumber(a.clientLimit, locale)}`}
									</td>
									<td className="text-muted text-xs">
										{a.expiresAt ? (
											<span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDate(a.expiresAt, locale)}</span>
										) : (
											L("بی‌انقضا", "No expiry")
										)}
									</td>
									<td>
										<Badge tone={!a.exists ? "danger" : a.isActive ? "success" : "muted"}>{!a.exists ? L("حذف شده", "Deleted") : a.isActive ? t("active") : t("inactive")}</Badge>
									</td>
									<td className="text-end">
										{a.exists && (
											<Button type="button" size="sm" variant="ghost" loading={busy === a.adminId} title={L("بازنشانی گذرواژه", "Reset password")} onClick={() => resetPassword(a)}>
												<KeyRound className="h-4 w-4" />
											</Button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</Card>
	)
}
