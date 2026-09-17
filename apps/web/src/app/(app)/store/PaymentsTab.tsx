"use client"

import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { Banknote, Coins, CreditCard, Landmark, Settings2 } from "lucide-react"
import { api } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Spinner, cx, useToast } from "@/components/ui"
import { CardPay } from "./CardPay"
import { CryptoWallets } from "./CryptoWallets"
import { PluginsCard } from "./PluginsCard"
import { FxCard } from "./payments/FxCard"
import { UsdtCard } from "./payments/UsdtCard"
import { ZarinpalCard } from "./payments/ZarinpalCard"
import { cardBody, fxBody } from "./payments/bodies"
import { tr, type CardDto, type FxDto, type Method, type StoreExtras, type StoreSettings } from "./types"

type PayTab = "usdt" | "card" | "zarinpal" | "crypto" | "plugins"

/**
 * Payments, grouped per method instead of one endless page.
 *
 * All three panel-side methods keep their state here, so switching sub-tabs never
 * drops an edit and a single save writes store settings + FX + card-to-card.
 * Crypto wallets and payment plugins have their own APIs and save buttons, so they
 * live outside the form.
 */
export function PaymentsTab({ initial }: { initial: StoreSettings }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [s, setS] = useState<StoreSettings>(initial)
	const [fx, setFx] = useState<FxDto | null>(null)
	const [card, setCard] = useState<CardDto | null>(null)
	const [secret, setSecret] = useState("")
	const [merchant, setMerchant] = useState("")
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [dirty, setDirty] = useState(false)
	const [tab, setTab] = useState<PayTab>("usdt")

	const set = (p: Partial<StoreSettings>) => {
		setDirty(true)
		setS((x) => ({ ...x, ...p }))
	}
	const setF = (p: Partial<FxDto>) => {
		setDirty(true)
		setFx((x) => (x ? { ...x, ...p } : x))
	}
	const setC = (p: Partial<CardDto>) => {
		setDirty(true)
		setCard((x) => (x ? { ...x, ...p } : x))
	}
	const onSecret = (v: string) => {
		setDirty(true)
		setSecret(v)
	}
	const onMerchant = (v: string) => {
		setDirty(true)
		setMerchant(v)
	}

	const auto = fx?.mode === "AUTO"
	const effRate = auto && fx && fx.cacheRate > 0 ? fx.cacheRate : Number(s.usdtRate) || 0
	const liveMethods = [s.usdtEnabled ? "USDT" : null, s.cardEnabled ? "CARD" : null, s.zarinpalEnabled ? "ZARINPAL" : null].filter(Boolean) as Method[]

	useEffect(() => {
		let alive = true
		api<StoreExtras>("/api/store/extras")
			.then((d) => {
				if (!alive) return
				setFx({ ...d.fx })
				setCard(d.card)
			})
			.catch((e: unknown) => toast.err(e instanceof Error ? e.message : t("error_generic")))
			.finally(() => {
				if (alive) setLoading(false)
			})
		return () => {
			alive = false
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	async function save(e: FormEvent) {
		e.preventDefault()
		setSaving(true)
		try {
			const body: Record<string, unknown> = {
				usdtEnabled: s.usdtEnabled,
				usdtAddress: s.usdtAddress,
				usdtNetwork: s.usdtNetwork,
				usdtRate: effRate,
				usdtAutoVerify: s.usdtAutoVerify,
				cardEnabled: s.cardEnabled,
				cardNumber: s.cardNumber,
				cardHolder: s.cardHolder,
				cardBank: s.cardBank,
				zarinpalEnabled: s.zarinpalEnabled,
				zarinpalSandbox: s.zarinpalSandbox,
			}
			if (merchant.trim()) body.zarinpalMerchant = merchant.trim()
			const saved = await api<StoreSettings>("/api/store/settings", { method: "PUT", json: body })
			setS(saved)
			setMerchant("")
			if (fx || card) {
				const extras = await api<StoreExtras>("/api/store/extras", {
					method: "PUT",
					json: { ...(fx ? { fx: fxBody(fx) } : {}), ...(card ? { card: cardBody(card, secret) } : {}) },
				})
				setFx({ ...extras.fx })
				setCard(extras.card)
				setSecret("")
			}
			setDirty(false)
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(err instanceof Error ? err.message : t("error_generic"))
		} finally {
			setSaving(false)
		}
	}

	const subs: Array<{ id: PayTab; label: string; icon: ReactNode; on?: boolean }> = [
		{ id: "usdt", label: t("pay_m_USDT"), icon: <Banknote className="h-3.5 w-3.5" />, on: s.usdtEnabled },
		{ id: "card", label: t("pay_m_CARD"), icon: <CreditCard className="h-3.5 w-3.5" />, on: s.cardEnabled },
		{ id: "zarinpal", label: t("pay_m_ZARINPAL"), icon: <Landmark className="h-3.5 w-3.5" />, on: s.zarinpalEnabled },
		{ id: "crypto", label: L("\u06a9\u06cc\u0641\u200c\u067e\u0648\u0644\u200c\u0647\u0627\u06cc \u0627\u0631\u0632\u06cc", "Crypto wallets"), icon: <Coins className="h-3.5 w-3.5" /> },
		{ id: "plugins", label: L("\u0627\u0641\u0632\u0648\u0646\u0647\u0654 \u067e\u0631\u062f\u0627\u062e\u062a", "Payment plugins"), icon: <Settings2 className="h-3.5 w-3.5" /> },
	]
	const spinner = (title: string, subtitle: string) => (
		<Card title={title} subtitle={subtitle}>
			<div className="flex items-center justify-center py-10">
				<Spinner />
			</div>
		</Card>
	)

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-1.5">
				{subs.map((x) => (
					<button key={x.id} type="button" className={cx("chip", tab === x.id && "chip-on")} onClick={() => setTab(x.id)}>
						{x.icon}
						{x.label}
						{x.on ? <span className="h-1.5 w-1.5 rounded-full bg-success" /> : null}
					</button>
				))}
			</div>

			<div className="glass flex flex-wrap items-center gap-2 px-4 py-2.5">
				{liveMethods.length ? liveMethods.map((m) => <Badge key={m} tone="cyan">{t(("pay_m_" + m) as never)}</Badge>) : <Badge tone="warning">{L("\u0647\u06cc\u0686 \u0631\u0648\u0634 \u067e\u0631\u062f\u0627\u062e\u062a\u06cc \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a", "No payment method is enabled")}</Badge>}
				{effRate > 0 ? (
					<span className="text-[11px] text-muted">
						{L("\u0646\u0631\u062e \u062a\u062a\u0631", "USDT rate")}: <b className="num">{formatNumber(effRate)}</b> {t("currency_irt")}
					</span>
				) : null}
				{fx ? <Badge tone={auto ? "violet" : "muted"}>{auto ? L("\u0646\u0631\u062e \u062e\u0648\u062f\u06a9\u0627\u0631", "Auto rate") : L("\u0646\u0631\u062e \u062f\u0633\u062a\u06cc", "Manual rate")}</Badge> : null}
			</div>

			{tab === "crypto" ? (
				<CryptoWallets />
			) : tab === "plugins" ? (
				<PluginsCard />
			) : (
				<form onSubmit={save} className="space-y-4">
					{tab === "usdt" &&
						(loading || !fx
							? spinner(t("pay_m_USDT"), t("pay_usdt_sub"))
							: (
								<div className="grid gap-4 lg:grid-cols-2">
									<UsdtCard s={s} onStore={set} rate={effRate} auto={auto} />
									<FxCard fx={fx} onFx={setF} onRate={(rate) => set({ usdtRate: rate })} usdtEnabled={s.usdtEnabled} effRate={effRate} />
								</div>
							))}
					{tab === "card" && (loading || !card ? spinner(t("pay_m_CARD"), t("pay_card_sub")) : <CardPay s={s} onStore={set} card={card} onCard={setC} secret={secret} onSecret={onSecret} />)}
					{tab === "zarinpal" && <ZarinpalCard s={s} onStore={set} merchant={merchant} onMerchant={onMerchant} />}

					<div className="sticky bottom-3 z-10">
						<div className="glass glass-2 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
							<span className={cx("text-[11px]", dirty ? "text-warning" : "text-muted")}>{dirty ? L("\u062a\u063a\u06cc\u06cc\u0631\u0627\u062a \u0630\u062e\u06cc\u0631\u0647 \u0646\u0634\u062f\u0647 \u0627\u0633\u062a", "Unsaved changes") : L("\u0647\u0645\u0647\u200c\u0686\u06cc\u0632 \u0630\u062e\u06cc\u0631\u0647 \u0634\u062f\u0647 \u0627\u0633\u062a", "Everything is saved")}</span>
							<Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
								{t("save")}
							</Button>
						</div>
					</div>
				</form>
			)}
		</div>
	)
}
