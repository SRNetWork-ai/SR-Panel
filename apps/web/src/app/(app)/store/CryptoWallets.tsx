"use client"

import { useCallback, useEffect, useState } from "react"
import { Coins, Plus, Save, Trash2 } from "lucide-react"
import { api } from "@/lib/client"
import { useLocale } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Spinner } from "@/components/ui"
import { tr } from "./types"

type Network = "TRC20" | "BEP20" | "ERC20" | "TON" | "SOL" | "POLYGON" | "ARBITRUM" | "AVAX" | "BTC" | "LTC" | "DOGE" | "XMR" | "OTHER"
type RateMode = "USDT" | "MARKET" | "FIXED"
type Asset = {
	id?: string
	symbol: string
	network: Network
	address: string
	memo?: string | null
	label?: string | null
	enabled?: boolean
	rateMode?: RateMode
	fixedRate?: number
	marginPct?: number
	decimals?: number
}

const NETWORKS: Array<{ id: Network; fa: string; en: string }> = [
	{ id: "TRC20", fa: "ترون (TRC20)", en: "Tron (TRC20)" },
	{ id: "BEP20", fa: "BNB Smart Chain (BEP20)", en: "BNB Smart Chain (BEP20)" },
	{ id: "ERC20", fa: "اتریوم (ERC20)", en: "Ethereum (ERC20)" },
	{ id: "TON", fa: "تون (TON)", en: "TON" },
	{ id: "SOL", fa: "سولانا", en: "Solana" },
	{ id: "POLYGON", fa: "پالیگان", en: "Polygon" },
	{ id: "ARBITRUM", fa: "آربیتروم", en: "Arbitrum" },
	{ id: "AVAX", fa: "آوالانچ (C-Chain)", en: "Avalanche (C-Chain)" },
	{ id: "BTC", fa: "بیت‌کوین", en: "Bitcoin" },
	{ id: "LTC", fa: "لایت‌کوین", en: "Litecoin" },
	{ id: "DOGE", fa: "دوج‌کوین", en: "Dogecoin" },
	{ id: "XMR", fa: "مونرو", en: "Monero" },
	{ id: "OTHER", fa: "شبکهٔ دیگر", en: "Other" },
]

const blank = (): Asset => ({ symbol: "USDT", network: "TRC20", address: "", memo: "", label: "", enabled: true, rateMode: "USDT", fixedRate: 0, marginPct: 0, decimals: 0 })

export function CryptoWallets() {
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const [assets, setAssets] = useState<Asset[] | null>(null)
	const [busy, setBusy] = useState(false)
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

	const load = useCallback(async () => {
		const r = await api<{ assets: Asset[] }>("/api/store/crypto")
		setAssets(r.assets ?? [])
	}, [])
	useEffect(() => {
		load().catch(() => setAssets([]))
	}, [load])

	const patch = (i: number, p: Partial<Asset>) => setAssets((prev) => (prev ?? []).map((a, k) => (k === i ? { ...a, ...p } : a)))
	const remove = (i: number) => setAssets((prev) => (prev ?? []).filter((_, k) => k !== i))

	async function save() {
		if (!assets) return
		setBusy(true)
		setMsg(null)
		try {
			const payload = assets
				.filter((a) => a.address.trim().length > 7 && a.symbol.trim().length > 1)
				.map((a) => ({ ...a, symbol: a.symbol.trim().toUpperCase(), address: a.address.trim(), memo: a.memo?.trim() || null, label: a.label?.trim() || null }))
			const r = await api<{ assets: Asset[] }>("/api/store/crypto", { method: "PUT", json: { assets: payload } })
			setAssets(r.assets ?? [])
			setMsg({ ok: true, text: L("کیف‌پول‌ها ذخیره شد", "Wallets saved") })
		} catch (err) {
			setMsg({ ok: false, text: err instanceof Error ? err.message : L("خطا در ذخیره", "Save failed") })
		} finally {
			setBusy(false)
		}
	}

	if (!assets) return <div className="flex justify-center p-10"><Spinner /></div>

	return (
		<Card
			title={<span className="inline-flex items-center gap-2"><Coins className="h-4 w-4" /> {L("ارزهای دیجیتال و شبکه‌ها", "Crypto wallets")}</span>}
			subtitle={L("هر کیف‌پول = یک ارز روی یک شبکه؛ مبلغ هر سفارش با نرخ لحظه‌ای محاسبه می‌شود", "One wallet = one coin on one network; every order is priced with a live rate")}
			actions={
				<>
					<Button type="button" size="sm" variant="ghost" onClick={() => setAssets([...(assets ?? []), blank()])}><Plus className="h-4 w-4" /> {L("افزودن", "Add")}</Button>
					<Button type="button" size="sm" loading={busy} onClick={save}><Save className="h-4 w-4" /> {L("ذخیره", "Save")}</Button>
				</>
			}
		>
			<div className="space-y-3">
				{msg && <div className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{msg.text}</div>}

				{assets.length === 0 && <Empty text={L("هنوز کیف‌پولی ثبت نشده — فعلاً همان آدرس تتر در تنظیمات پرداخت استفاده می‌شود", "No wallet yet — the USDT address from payment settings is used")} action={<Button type="button" onClick={() => setAssets([blank()])}><Plus className="h-4 w-4" /> {L("افزودن کیف‌پول", "Add wallet")}</Button>} />}

				{assets.map((a, i) => (
					<div key={a.id || `new-${i}`} className="tile space-y-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<Badge tone={a.enabled === false ? "muted" : "cyan"}>{a.symbol || "?"}</Badge>
								<span className="text-xs text-muted">{NETWORKS.find((n) => n.id === a.network)?.[locale === "fa" ? "fa" : "en"] ?? a.network}</span>
							</div>
							<div className="flex items-center gap-2">
								<label className="flex items-center gap-1 text-xs text-muted">
									<input type="checkbox" checked={a.enabled !== false} onChange={(e) => patch(i, { enabled: e.target.checked })} /> {L("فعال", "Enabled")}
								</label>
								<Button type="button" size="sm" variant="ghost" onClick={() => remove(i)}><Trash2 className="h-4 w-4 text-danger" /></Button>
							</div>
						</div>

						<div className="grid gap-2 sm:grid-cols-4">
							<label className="label">{L("نماد ارز", "Symbol")}<input className="input mono mt-1" dir="ltr" value={a.symbol} onChange={(e) => patch(i, { symbol: e.target.value.toUpperCase() })} placeholder="USDT" /></label>
							<label className="label">{L("شبکه", "Network")}
								<select className="input mt-1" value={a.network} onChange={(e) => patch(i, { network: e.target.value as Network })}>
									{NETWORKS.map((n) => <option key={n.id} value={n.id}>{locale === "fa" ? n.fa : n.en}</option>)}
								</select>
							</label>
							<label className="label sm:col-span-2">{L("آدرس کیف‌پول", "Wallet address")}<input className="input mono mt-1 text-xs" dir="ltr" value={a.address} onChange={(e) => patch(i, { address: e.target.value })} placeholder="T... / 0x... / UQ..." /></label>
						</div>

						<div className="grid gap-2 sm:grid-cols-4">
							<label className="label">{L("ممو / تگ (اختیاری)", "Memo / tag")}<input className="input mono mt-1 text-xs" dir="ltr" value={a.memo ?? ""} onChange={(e) => patch(i, { memo: e.target.value })} /></label>
							<label className="label">{L("برچسب نمایشی", "Label")}<input className="input mt-1" value={a.label ?? ""} onChange={(e) => patch(i, { label: e.target.value })} placeholder={L("مثلاً تتر ارزان", "e.g. cheapest")} /></label>
							<label className="label">{L("مبنای نرخ", "Rate mode")}
								<select className="input mt-1" value={a.rateMode ?? "USDT"} onChange={(e) => patch(i, { rateMode: e.target.value as RateMode })}>
									<option value="USDT">{L("نرخ تتر پنل (استیبل‌کوین)", "Panel USDT rate")}</option>
									<option value="MARKET">{L("قیمت لحظه‌ای بازار", "Live market price")}</option>
									<option value="FIXED">{L("نرخ ثابت دستی", "Fixed rate")}</option>
								</select>
							</label>
							<label className="label">{L("کارمزد (درصد)", "Margin (%)")}<input type="number" step="0.1" className="input num mt-1" value={a.marginPct ?? 0} onChange={(e) => patch(i, { marginPct: Number(e.target.value) })} /></label>
						</div>

						{a.rateMode === "FIXED" && (
							<label className="label">{L("نرخ ثابت هر واحد (تومان)", "Fixed rate per coin (IRT)")}<input type="number" className="input num mt-1" value={a.fixedRate ?? 0} onChange={(e) => patch(i, { fixedRate: Number(e.target.value) })} /></label>
						)}
					</div>
				))}

				<p className="text-[11px] text-muted">
					{L(
						"برای فعال بودن پرداخت ارزی، گزینهٔ تتر در بالا باید روشن و یک آدرس داشته باشد. تأیید خودکار فقط برای USDT روی TRC20 کار می‌کند؛ بقیهٔ ارزها دستی تأیید می‌شوند.",
						"Crypto checkout needs the USDT toggle above enabled with an address. Auto-verification only covers USDT on TRC20; other coins are reviewed manually.",
					)}
				</p>
			</div>
		</Card>
	)
}
