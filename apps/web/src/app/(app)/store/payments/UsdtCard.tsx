"use client"

import { useLocale, useT } from "@/lib/i18n"
import { Card, Field, Input, Select, Switch, cx } from "@/components/ui"
import { CopyBtn } from "../parts"
import { tr, type StoreSettings } from "../types"

/** Tether wallet: address, network and rate (read-only while the FX chain runs in auto mode). */
export function UsdtCard({ s, onStore, rate, auto }: { s: StoreSettings; onStore: (p: Partial<StoreSettings>) => void; rate: number; auto: boolean }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	return (
		<Card title={t("pay_m_USDT")} subtitle={t("pay_usdt_sub")} actions={<Switch checked={s.usdtEnabled} onChange={(v) => onStore({ usdtEnabled: v })} />}>
			<div className={cx("space-y-3 transition", !s.usdtEnabled && "opacity-60")}>
				<Field label={t("pay_usdt_address")}>
					<div className="flex gap-2">
						<Input dir="ltr" className="mono" value={s.usdtAddress ?? ""} onChange={(e) => onStore({ usdtAddress: e.target.value.trim() })} placeholder="T…" />
						{s.usdtAddress ? <CopyBtn value={s.usdtAddress} /> : null}
					</div>
				</Field>
				<div className="grid grid-cols-2 gap-3">
					<Field label={t("pay_usdt_network")}>
						<Select value={s.usdtNetwork} onChange={(e) => onStore({ usdtNetwork: e.target.value })}>
							<option value="TRC20">TRC20 (Tron)</option>
						</Select>
					</Field>
					<Field label={t("pay_usdt_rate")} hint={auto ? L("در حالت خودکار نرخ از منابع خوانده می‌شود", "Auto mode pulls the rate from the sources") : t("pay_usdt_rate_hint")}>
						<Input type="number" min={0} value={rate} readOnly={auto} onChange={(e) => onStore({ usdtRate: Number(e.target.value) })} />
					</Field>
				</div>
				<Switch checked={s.usdtAutoVerify} onChange={(v) => onStore({ usdtAutoVerify: v })} label={t("pay_usdt_auto")} />
			</div>
		</Card>
	)
}
