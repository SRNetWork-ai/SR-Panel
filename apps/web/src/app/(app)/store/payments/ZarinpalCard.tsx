"use client"

import { useT } from "@/lib/i18n"
import { Card, Field, Input, Switch, cx } from "@/components/ui"
import type { StoreSettings } from "../types"

/** Zarinpal: the merchant id is write-only, the panel shows a mask of the stored one. */
export function ZarinpalCard({ s, onStore, merchant, onMerchant }: { s: StoreSettings; onStore: (p: Partial<StoreSettings>) => void; merchant: string; onMerchant: (v: string) => void }) {
	const t = useT()
	return (
		<Card title={t("pay_m_ZARINPAL")} subtitle={t("pay_zp_sub")} actions={<Switch checked={s.zarinpalEnabled} onChange={(v) => onStore({ zarinpalEnabled: v })} />}>
			<div className={cx("grid gap-3 transition md:grid-cols-3", !s.zarinpalEnabled && "opacity-60")}>
				<div className="md:col-span-2">
					<Field label={t("pay_zp_merchant")} hint={s.hasZarinpal ? t("pay_zp_saved") + ": " + s.zarinpalMerchantMasked : t("pay_zp_merchant_hint")}>
						<Input dir="ltr" className="mono" value={merchant} onChange={(e) => onMerchant(e.target.value)} placeholder={s.hasZarinpal ? "••••••••" : "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"} />
					</Field>
				</div>
				<div className="flex items-end pb-1">
					<Switch checked={s.zarinpalSandbox} onChange={(v) => onStore({ zarinpalSandbox: v })} label={t("pay_zp_sandbox")} />
				</div>
			</div>
		</Card>
	)
}
