"use client"

import { useEffect, useRef, useState } from "react"
import { Check, LifeBuoy, RefreshCw, Send, Sparkles } from "lucide-react"
import { api } from "@/lib/client"
import { formatNumber } from "@/lib/format"
import { Checkout } from "./Checkout"
import { PlanGrid } from "./PlanGrid"
import { Faq, Features, Hero, Notice, ShopFooter, Steps, TrustRow } from "./ShopSections"
import { currencyLabel, socialLinks, type PublicPlan, type PublicStore } from "./types"

/** Kept for existing importers of the old single-file storefront. */
export type { PublicPlan, PublicStore } from "./types"

type TgWebApp = { initData?: string; ready?: () => void; expand?: () => void }

/**
 * Public storefront shell: brand header, marketing sections, plan grid and the
 * checkout form. Everything below the plan grid is seller-editable content.
 */
export function ShopClient({ store, renewToken, tgParam }: { store: PublicStore; renewToken?: string; tgParam?: string }) {
	const [plan, setPlan] = useState<PublicPlan | null>(null)
	const [identity, setIdentity] = useState({ telegramId: tgParam ?? "", name: "", verified: false })
	const checkoutRef = useRef<HTMLDivElement | null>(null)
	const currency = currencyLabel(store.currency)
	const links = socialLinks(store)

	// Telegram Mini-App: verify initData server-side and prefill the identity
	useEffect(() => {
		const tg = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp
		if (!tg?.initData) return
		tg.ready?.()
		tg.expand?.()
		api<{ ok: boolean; telegramId?: string; name?: string | null }>("/api/shop/tg", { method: "POST", json: { initData: tg.initData } })
			.then((r) => {
				if (r.ok && r.telegramId) setIdentity({ telegramId: r.telegramId, name: r.name ?? "", verified: true })
			})
			.catch(() => undefined)
	}, [])

	function pick(p: PublicPlan) {
		setPlan(p)
		window.setTimeout(() => checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80)
	}

	const style = { "--brand-primary": store.brand.primaryColor, "--brand-accent": store.brand.accentColor } as React.CSSProperties

	return (
		<div className="relative min-h-dvh" style={style} dir="rtl">
			<div className="aurora" />
			<div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6">
				<header className="fade-up flex flex-wrap items-center gap-3">
					{store.brand.logoUrl ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={store.brand.logoUrl} alt={store.brand.name} className="h-12 w-12 rounded-2xl object-contain" />
					) : (
						<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet to-cyan text-xl font-black text-white shadow-lg">{store.title.slice(0, 1)}</div>
					)}
					<div className="min-w-0">
						<h1 className="truncate text-lg font-bold">{store.title}</h1>
						{store.description || store.brand.tagline ? <p className="truncate text-xs text-muted">{store.description || store.brand.tagline}</p> : null}
					</div>
					<div className="ms-auto flex flex-wrap items-center gap-2">
						{links.support ? <a className="btn btn-ghost btn-sm" href={links.support} target="_blank" rel="noreferrer"><LifeBuoy className="h-4 w-4" /> پشتیبانی</a> : null}
						{links.tg ? <a className="btn btn-ghost btn-sm" href={links.tg} target="_blank" rel="noreferrer"><Send className="h-4 w-4" /> تلگرام</a> : null}
					</div>
				</header>

				{renewToken || identity.verified ? (
					<div className="fade-up flex flex-wrap items-center gap-2">
						{renewToken ? <span className="badge bg-cyan/20 text-cyan"><RefreshCw className="h-3 w-3" /> حالت تمدید اشتراک</span> : null}
						{identity.verified ? <span className="badge bg-success/20 text-success"><Check className="h-3 w-3" /> تلگرام تأیید شد</span> : null}
					</div>
				) : null}

				<Notice store={store} />
				<Hero store={store} />
				<TrustRow store={store} />

				<section id="plans" className="fade-up scroll-mt-4 space-y-3">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-violet" /> انتخاب پلن</div>
						{store.plans.length > 0 ? <span className="num text-[11px] text-muted">{formatNumber(store.plans.length, "fa")} پلن فعال</span> : null}
					</div>
					<PlanGrid plans={store.plans} selectedId={plan ? plan.id : null} currency={currency} onSelect={pick} />
				</section>

				<div id="checkout" ref={checkoutRef} className="scroll-mt-4">
					{plan ? (
						<Checkout store={store} plan={plan} renewToken={renewToken} identity={identity} onChangePlan={() => setPlan(null)} />
					) : store.plans.length > 0 ? (
						<div className="glass p-5 text-center text-sm text-muted">برای ادامه، یکی از پلن‌های بالا را انتخاب کنید.</div>
					) : null}
				</div>

				<Features store={store} />
				<Steps store={store} />
				<Faq store={store} />
				<ShopFooter store={store} />
			</div>
		</div>
	)
}
