"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, KeyRound, Plus, RefreshCw, Save, Settings2, Trash2 } from "lucide-react"
import { api } from "@/lib/client"
import { useLocale } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Spinner } from "@/components/ui"
import { CopyBtn } from "./parts"
import { tr } from "./types"

type Method = "CARD" | "USDT" | "ZARINPAL"

type Plugin = {
	id: string
	name: string
	enabled: boolean
	master: boolean
	methods: Method[]
	payUrl: string
	autoConfirm: boolean
	maxAmount: number
	note: string
	createdAt: string
	lastCallAt: string | null
	lastStatus: string | null
	lastError: string | null
	calls: number
	confirmed: number
	callbackUrl: string
	hasSecret: boolean
}

const METHODS: Method[] = ["CARD", "USDT", "ZARINPAL"]

/**
 * Payment plugins: an outside provider or automation confirms a payment this
 * panel already created, through one signed webhook. It is deliberately not a
 * new payment method - it rides on card / crypto / Zarinpal.
 */
export function PluginsCard() {
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const [items, setItems] = useState<Plugin[] | null>(null)
	const [busy, setBusy] = useState("")
	const [fresh, setFresh] = useState<{ id: string; secret: string } | null>(null)
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

	const load = useCallback(async () => {
		const r = await api<{ plugins: Plugin[] }>("/api/settings/payment-plugins")
		setItems(r.plugins ?? [])
	}, [])
	useEffect(() => {
		load().catch(() => setItems([]))
	}, [load])

	const patch = (id: string, p: Partial<Plugin>) => setItems((prev) => (prev ?? []).map((x) => (x.id === id ? { ...x, ...p } : x)))
	const fail = (e: unknown) => setMsg({ ok: false, text: e instanceof Error ? e.message : L("\u062e\u0637\u0627\u06cc \u063a\u06cc\u0631\u0645\u0646\u062a\u0638\u0631\u0647", "Unexpected error") })
	const methodLabel = (m: Method) => (m === "CARD" ? L("\u06a9\u0627\u0631\u062a \u0628\u0647 \u06a9\u0627\u0631\u062a", "Card") : m === "USDT" ? L("\u0627\u0631\u0632 \u062f\u06cc\u062c\u06cc\u062a\u0627\u0644", "Crypto") : L("\u0632\u0631\u06cc\u0646\u200c\u067e\u0627\u0644", "Zarinpal"))

	async function add() {
		setBusy("new")
		setMsg(null)
		try {
			const r = await api<{ plugin: Plugin; secret: string }>("/api/settings/payment-plugins", {
				method: "POST",
				json: { name: L("\u0627\u0641\u0632\u0648\u0646\u0647\u0654 \u062c\u062f\u06cc\u062f", "New plugin"), methods: ["CARD"], enabled: true, autoConfirm: true, maxAmount: 0, payUrl: "", note: "" },
			})
			setItems((prev) => [...(prev ?? []), r.plugin])
			setFresh({ id: r.plugin.id, secret: r.secret })
			setMsg({ ok: true, text: L("\u0627\u0641\u0632\u0648\u0646\u0647 \u0633\u0627\u062e\u062a\u0647 \u0634\u062f\u061b \u06a9\u0644\u06cc\u062f \u0627\u0645\u0636\u0627 \u0641\u0642\u0637 \u0647\u0645\u06cc\u0646 \u062d\u0627\u0644\u0627 \u0646\u0645\u0627\u06cc\u0634 \u062f\u0627\u062f\u0647 \u0645\u06cc\u200c\u0634\u0648\u062f", "Plugin created - the signing secret is shown only now") })
		} catch (e) {
			fail(e)
		} finally {
			setBusy("")
		}
	}

	async function save(p: Plugin) {
		setBusy(p.id)
		setMsg(null)
		try {
			const r = await api<{ plugin: Plugin }>("/api/settings/payment-plugins", {
				method: "PUT",
				json: { id: p.id, name: p.name.trim(), enabled: p.enabled, methods: p.methods, payUrl: p.payUrl.trim(), autoConfirm: p.autoConfirm, maxAmount: Number(p.maxAmount) || 0, note: p.note.trim() },
			})
			patch(p.id, r.plugin)
			setMsg({ ok: true, text: L("\u0630\u062e\u06cc\u0631\u0647 \u0634\u062f", "Saved") })
		} catch (e) {
			fail(e)
		} finally {
			setBusy("")
		}
	}

	async function rotate(id: string) {
		setBusy(id)
		setMsg(null)
		try {
			const r = await api<{ plugin: Plugin; secret: string }>("/api/settings/payment-plugins", { method: "PATCH", json: { id } })
			patch(id, r.plugin)
			setFresh({ id, secret: r.secret })
			setMsg({ ok: true, text: L("\u06a9\u0644\u06cc\u062f \u062a\u0627\u0632\u0647 \u0633\u0627\u062e\u062a\u0647 \u0634\u062f\u061b \u06a9\u0644\u06cc\u062f \u0642\u0628\u0644\u06cc \u062f\u06cc\u06af\u0631 \u06a9\u0627\u0631 \u0646\u0645\u06cc\u200c\u06a9\u0646\u062f", "New secret issued - the old one stopped working") })
		} catch (e) {
			fail(e)
		} finally {
			setBusy("")
		}
	}

	async function remove(id: string) {
		setBusy(id)
		setMsg(null)
		try {
			await api("/api/settings/payment-plugins?id=" + encodeURIComponent(id), { method: "DELETE" })
			setItems((prev) => (prev ?? []).filter((x) => x.id !== id))
			if (fresh?.id === id) setFresh(null)
			setMsg({ ok: true, text: L("\u0627\u0641\u0632\u0648\u0646\u0647 \u062d\u0630\u0641 \u0634\u062f", "Plugin removed") })
		} catch (e) {
			fail(e)
		} finally {
			setBusy("")
		}
	}

	if (!items)
		return (
			<div className="flex justify-center p-10">
				<Spinner />
			</div>
		)

	return (
		<Card
			title={
				<span className="inline-flex items-center gap-2">
					<Settings2 className="h-4 w-4" /> {L("\u0627\u0641\u0632\u0648\u0646\u0647\u0654 \u067e\u0631\u062f\u0627\u062e\u062a", "Payment plugins")}
				</span>
			}
			subtitle={L(
				"\u0647\u0631 \u0627\u0641\u0632\u0648\u0646\u0647 \u06cc\u06a9 \u0648\u0628\u200c\u0647\u0648\u06a9 \u0627\u0645\u0636\u0627\u0634\u062f\u0647 \u0627\u0633\u062a\u061b \u0633\u0631\u0648\u06cc\u0633 \u0628\u06cc\u0631\u0648\u0646\u06cc \u0628\u0627 \u0622\u0646 \u067e\u0631\u062f\u0627\u062e\u062a\u200c\u0647\u0627\u06cc \u0647\u0645\u06cc\u0646 \u067e\u0646\u0644 \u0631\u0627 \u062a\u0623\u06cc\u06cc\u062f \u0645\u06cc\u200c\u06a9\u0646\u062f",
				"Each plugin is one signed webhook an outside service can use to confirm this panel's payments",
			)}
			actions={
				<Button type="button" size="sm" loading={busy === "new"} onClick={add}>
					<Plus className="h-4 w-4" /> {L("\u0627\u0641\u0632\u0648\u062f\u0646", "Add")}
				</Button>
			}
		>
			<div className="space-y-3">
				{msg && <div className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{msg.text}</div>}

				{items.length === 0 && (
					<Empty
						text={L("\u0647\u0646\u0648\u0632 \u0627\u0641\u0632\u0648\u0646\u0647\u200c\u0627\u06cc \u0646\u0633\u0627\u062e\u062a\u0647\u200c\u0627\u06cc\u062f", "No plugin yet")}
						action={
							<Button type="button" loading={busy === "new"} onClick={add}>
								<Plus className="h-4 w-4" /> {L("\u0633\u0627\u062e\u062a \u0627\u0641\u0632\u0648\u0646\u0647", "Create plugin")}
							</Button>
						}
					/>
				)}

				{items.map((p) => (
					<div key={p.id} className="tile space-y-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex min-w-0 flex-1 items-center gap-2">
								<Badge tone={p.enabled ? "cyan" : "muted"}>{p.enabled ? L("\u0641\u0639\u0627\u0644", "On") : L("\u062e\u0627\u0645\u0648\u0634", "Off")}</Badge>
								{p.master && <Badge tone="violet">{L("\u0647\u0645\u0647\u0654 \u0627\u062f\u0645\u06cc\u0646\u200c\u0647\u0627", "All admins")}</Badge>}
								<input className="input min-w-0 flex-1" value={p.name} onChange={(e) => patch(p.id, { name: e.target.value })} />
							</div>
							<div className="flex items-center gap-1">
								<Button type="button" size="sm" loading={busy === p.id} onClick={() => save(p)} title={L("\u0630\u062e\u06cc\u0631\u0647", "Save")}>
									<Save className="h-4 w-4" />
								</Button>
								<Button type="button" size="sm" variant="ghost" onClick={() => rotate(p.id)} title={L("\u06a9\u0644\u06cc\u062f \u062a\u0627\u0632\u0647", "New secret")}>
									<RefreshCw className="h-4 w-4" />
								</Button>
								<Button type="button" size="sm" variant="ghost" onClick={() => remove(p.id)} title={L("\u062d\u0630\u0641", "Delete")}>
									<Trash2 className="h-4 w-4 text-danger" />
								</Button>
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<span className="text-[11px] text-muted">{L("\u0646\u0634\u0627\u0646\u06cc \u0648\u0628\u200c\u0647\u0648\u06a9", "Callback URL")}</span>
							<code className="mono min-w-0 flex-1 truncate rounded-lg bg-white/5 px-2 py-1 text-[11px]" dir="ltr">
								{p.callbackUrl}
							</code>
							<CopyBtn value={p.callbackUrl} />
						</div>

						{fresh?.id === p.id && (
							<div className="flex flex-wrap items-center gap-2 rounded-xl bg-warning/10 p-2">
								<KeyRound className="h-4 w-4 text-warning" />
								<code className="mono min-w-0 flex-1 truncate text-[11px]" dir="ltr">
									{fresh.secret}
								</code>
								<CopyBtn value={fresh.secret} label={L("\u06a9\u067e\u06cc \u06a9\u0644\u06cc\u062f", "Copy secret")} />
								<Button type="button" size="sm" variant="ghost" onClick={() => setFresh(null)}>
									<Check className="h-4 w-4" />
								</Button>
							</div>
						)}

						<div className="flex flex-wrap items-center gap-3">
							<span className="text-[11px] text-muted">{L("\u0631\u0648\u0634\u200c\u0647\u0627\u06cc \u0645\u062c\u0627\u0632", "Allowed methods")}</span>
							{METHODS.map((m) => (
								<label key={m} className="flex items-center gap-1 text-xs text-muted">
									<input
										type="checkbox"
										checked={p.methods.includes(m)}
										onChange={(e) => patch(p.id, { methods: e.target.checked ? [...p.methods, m] : p.methods.filter((x) => x !== m) })}
									/>{" "}
									{methodLabel(m)}
								</label>
							))}
							<label className="flex items-center gap-1 text-xs text-muted">
								<input type="checkbox" checked={p.enabled} onChange={(e) => patch(p.id, { enabled: e.target.checked })} /> {L("\u0641\u0639\u0627\u0644", "Enabled")}
							</label>
							<label className="flex items-center gap-1 text-xs text-muted">
								<input type="checkbox" checked={p.autoConfirm} onChange={(e) => patch(p.id, { autoConfirm: e.target.checked })} /> {L("\u062a\u0623\u06cc\u06cc\u062f \u062e\u0648\u062f\u06a9\u0627\u0631", "Auto confirm")}
							</label>
						</div>

						<div className="grid gap-2 sm:grid-cols-3">
							<label className="label">
								{L("\u0633\u0642\u0641 \u062a\u0623\u06cc\u06cc\u062f \u062e\u0648\u062f\u06a9\u0627\u0631 (\u062a\u0648\u0645\u0627\u0646\u060c \u06f0 = \u0628\u06cc\u200c\u0646\u0647\u0627\u06cc\u062a)", "Auto-confirm cap (IRT, 0 = none)")}
								<input type="number" className="input num mt-1" value={p.maxAmount} onChange={(e) => patch(p.id, { maxAmount: Number(e.target.value) })} />
							</label>
							<label className="label sm:col-span-2">
								{L("\u0644\u06cc\u0646\u06a9 \u067e\u0631\u062f\u0627\u062e\u062a (\u0627\u062e\u062a\u06cc\u0627\u0631\u06cc)", "Pay link (optional)")}
								<input className="input mono mt-1 text-xs" dir="ltr" value={p.payUrl} onChange={(e) => patch(p.id, { payUrl: e.target.value })} placeholder="https://pay.example.com/?amount={amount}&payment={payment}" />
							</label>
						</div>

						<label className="label">
							{L("\u06cc\u0627\u062f\u062f\u0627\u0634\u062a", "Note")}
							<input className="input mt-1" value={p.note} onChange={(e) => patch(p.id, { note: e.target.value })} />
						</label>

						<div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
							<span>
								{L("\u062f\u0631\u062e\u0648\u0627\u0633\u062a\u200c\u0647\u0627", "Calls")}: <b className="num">{p.calls}</b>
							</span>
							<span>
								{L("\u062a\u0623\u06cc\u06cc\u062f\u0634\u062f\u0647", "Confirmed")}: <b className="num">{p.confirmed}</b>
							</span>
							{p.lastStatus && <span dir="ltr">{p.lastStatus}</span>}
							{p.lastError && <span className="text-danger">{p.lastError}</span>}
						</div>
					</div>
				))}

				<div className="space-y-1 text-[11px] text-muted">
					<p>
						{L(
							"\u0633\u0631\u0648\u06cc\u0633 \u0628\u06cc\u0631\u0648\u0646\u06cc \u0628\u0627\u06cc\u062f \u0628\u0647 \u0646\u0634\u0627\u0646\u06cc \u0628\u0627\u0644\u0627 \u06cc\u06a9 POST \u0628\u0627 \u0628\u062f\u0646\u0647\u0654 JSON \u0648 \u0647\u062f\u0631 x-srp-signature \u0628\u0641\u0631\u0633\u062a\u062f\u061b \u0627\u0645\u0636\u0627 = HMAC-SHA256 \u0647\u0645\u0627\u0646 \u0628\u062f\u0646\u0647 \u0628\u0627 \u06a9\u0644\u06cc\u062f \u0627\u0641\u0632\u0648\u0646\u0647.",
							"The provider POSTs JSON to the URL above with an x-srp-signature header: HMAC-SHA256 of that exact body, keyed with the plugin secret.",
						)}
					</p>
					<pre className="mono overflow-x-auto rounded-lg bg-white/5 p-2 text-[10px]" dir="ltr">
						{'BODY=\'{"paymentId":"<id>","status":"ok","amount":250000,"refId":"123"}\'\nSIG=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk \'{print $2}\')\ncurl -X POST -H "content-type: application/json" -H "x-srp-signature: $SIG" -d "$BODY" <callback-url>'}
					</pre>
					<p>
						{L(
							"\u0627\u06af\u0631 \u0645\u0628\u0644\u063a \u0627\u0639\u0644\u0627\u0645\u200c\u0634\u062f\u0647 \u06a9\u0645\u062a\u0631 \u0627\u0632 \u0645\u0628\u0644\u063a \u067e\u0631\u062f\u0627\u062e\u062a \u0628\u0627\u0634\u062f\u060c \u06cc\u0627 \u0627\u0632 \u0633\u0642\u0641 \u0628\u0627\u0644\u0627\u062a\u0631 \u0628\u0631\u0648\u062f\u060c \u067e\u0631\u062f\u0627\u062e\u062a \u062e\u0648\u062f\u06a9\u0627\u0631 \u062a\u0623\u06cc\u06cc\u062f \u0646\u0645\u06cc\u200c\u0634\u0648\u062f \u0648 \u0641\u0642\u0637 \u0628\u0647 \u0635\u0641 \u0628\u0631\u0631\u0633\u06cc \u062f\u0633\u062a\u06cc \u0645\u06cc\u200c\u0631\u0648\u062f.",
							"A declared amount below the payment total, or above the cap, never auto-confirms: it only moves the payment to manual review.",
						)}
					</p>
				</div>
			</div>
		</Card>
	)
}
