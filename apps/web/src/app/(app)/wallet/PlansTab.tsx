"use client"

import { useCallback, useEffect, useState } from "react"
import { Clock, Gauge, Package, RefreshCw, Users } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Spinner, useConfirm, useToast } from "@/components/ui"
import { PlansAdmin } from "./PlansAdmin"
import { tr, type PlanPurchase, type PlansPayload, type ResellerPlanDto } from "./types"

/**
 * A reseller buys a package for its own account (traffic quota / validity /
 * client slots) and pays from its wallet. The owner sees the editor instead.
 */
export function PlansTab({ isOwner, balance, onDone }: { isOwner: boolean; balance: number; onDone: () => void }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const confirm = useConfirm()
	const [data, setData] = useState<PlansPayload | null>(null)
	const [busy, setBusy] = useState<string | null>(null)

	const load = useCallback(async () => {
		setData(await api<PlansPayload>("/api/wallet/plans"))
	}, [])
	useEffect(() => {
		load().catch(() => setData({ isOwner, enabled: false, plans: [] }))
	}, [load, isOwner])

	const buy = async (p: ResellerPlanDto) => {
		if (!confirm(`${L("خرید", "Buy")} «${p.name}» — ${formatNumber(p.price, locale)} ${t("currency_irt")}`)) return
		setBusy(p.id)
		try {
			const r = await api<PlanPurchase>("/api/wallet/plans", { method: "POST", json: { planId: p.id } })
			toast.ok(`${L("بسته اعمال شد", "Package applied")} — ${L("موجودی", "Balance")}: ${formatNumber(r.balance, locale)} ${t("currency_irt")}`)
			onDone()
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setBusy(null)
		}
	}

	if (!data) return <div className="flex justify-center p-10"><Spinner /></div>
	if (data.isOwner) return <PlansAdmin enabled={data.enabled} plans={data.plans} onSaved={setData} />
	if (!data.enabled) return <Empty text={L("فروش بستهٔ نمایندگی فعال نیست", "Reseller packages are disabled")} />
	if (data.plans.length === 0) return <Empty text={L("بسته‌ای برای حساب شما ارائه نشده است", "No package is offered to your account")} />

	return (
		<Card
			title={L("بسته‌های نمایندگی", "Reseller packages")}
			subtitle={L("حجم، زمان و ظرفیت کلاینت را با کیف پول خودتان بخرید", "Buy traffic, validity and client slots from your wallet")}
			actions={<Button type="button" size="sm" variant="ghost" onClick={() => load().catch(() => undefined)}><RefreshCw className="h-4 w-4" /></Button>}
		>
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{data.plans.map((p) => (
					<div key={p.id} className="tile space-y-2">
						<div className="flex items-start justify-between gap-2">
							<span className="font-medium">{p.name}</span>
							<Badge tone="violet">{formatNumber(p.price, locale)} {t("currency_irt")}</Badge>
						</div>
						{p.description ? <p className="text-[11px] text-muted">{p.description}</p> : null}
						<div className="flex flex-wrap gap-1.5">
							{p.gb > 0 && <span className="chip num"><Gauge className="h-3 w-3" /> {formatNumber(p.gb, locale)} GB</span>}
							{p.days > 0 && <span className="chip num"><Clock className="h-3 w-3" /> {formatNumber(p.days, locale)} {t("days")}</span>}
							{p.clients > 0 && <span className="chip num"><Users className="h-3 w-3" /> +{formatNumber(p.clients, locale)}</span>}
						</div>
						<div className="pt-1">
							<Button type="button" variant="primary" disabled={busy !== null} onClick={() => buy(p)}>
								<Package className="h-4 w-4" />
								{busy === p.id ? L("در حال خرید…", "Buying…") : L("خرید", "Buy")}
							</Button>
						</div>
						{balance < p.price ? <p className="text-[11px] text-warning">{L("موجودی کیف پول از قیمت بسته کمتر است", "Wallet balance is below the price")}</p> : null}
					</div>
				))}
			</div>
		</Card>
	)
}
