"use client"

import { useMemo, useState, type FormEvent } from "react"
import { api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Field, Input, Modal, Switch, cx, useToast } from "@/components/ui"
import { errMsg, groupEvents, tr, type WebhookRow } from "./types"

/** Mounted only while editing, so the props seed the initial state once. */
export function WebhookModal({
	value,
	events,
	onClose,
	onSaved,
}: {
	value: Partial<WebhookRow>
	events: string[]
	onClose: () => void
	onSaved: (created: WebhookRow | null) => void
}) {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const L = (fa: string, en: string) => tr(locale, fa, en)

	const [url, setUrl] = useState(value.url ?? "")
	const [isActive, setIsActive] = useState(value.isActive ?? true)
	const [sel, setSel] = useState<string[]>(value.events ?? [])
	const [q, setQ] = useState("")
	const [saving, setSaving] = useState(false)

	const groups = useMemo(() => {
		const needle = q.trim().toLowerCase()
		return groupEvents(needle ? events.filter((e) => e.toLowerCase().includes(needle)) : events)
	}, [events, q])

	function toggle(ev: string) {
		setSel((cur) => (cur.includes(ev) ? cur.filter((x) => x !== ev) : [...cur, ev]))
	}

	function setGroup(items: string[], on: boolean) {
		setSel((cur) => (on ? Array.from(new Set([...cur, ...items])) : cur.filter((x) => !items.includes(x))))
	}

	async function save(e: FormEvent) {
		e.preventDefault()
		setSaving(true)
		try {
			const body = { url: url.trim(), events: sel, isActive }
			if (value.id) {
				await api(`/api/webhooks/${value.id}`, { method: "PATCH", json: body })
				onSaved(null)
			} else {
				const r = await api<{ webhook: WebhookRow }>("/api/webhooks", { method: "POST", json: body })
				onSaved(r.webhook)
			}
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setSaving(false)
		}
	}

	return (
		<Modal
			open
			onClose={onClose}
			title={value.id ? t("wh_edit") : t("wh_create")}
			subtitle={L("رویدادهای پنل را به سرویس خودتان بفرستید.", "Push panel events to your own service.")}
			size="lg"
			footer={
				<>
					<Button type="button" onClick={onClose}>{t("cancel")}</Button>
					<Button variant="primary" form="wh-form" type="submit" loading={saving} disabled={!url.trim()}>{t("save")}</Button>
				</>
			}
		>
			<form id="wh-form" onSubmit={save} className="space-y-4">
				<Field label={t("wh_url")} hint={L("فقط http یا https؛ بدنهٔ درخواست JSON است.", "http(s) only; the request body is JSON.")}>
					<Input dir="ltr" type="url" required className="mono" placeholder="https://example.com/hooks/srpanel" value={url} onChange={(e) => setUrl(e.target.value)} />
				</Field>

				<div className="tile p-3">
					<Switch checked={isActive} onChange={setIsActive} label={t("wh_active")} />
					<div className="mt-1 text-xs text-muted">{L("در حالت غیرفعال، رویدادها ذخیره یا ارسال نمی‌شوند.", "While inactive, events are not delivered.")}</div>
				</div>

				<Field label={t("wh_events")} hint={t("wh_events_hint")}>
					<div className="space-y-3">
						<div className="flex flex-wrap items-center gap-2">
							<Input className="w-48" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
							<Button type="button" size="sm" onClick={() => setSel([])}>{t("wh_all_events")}</Button>
							{sel.length === 0 ? (
								<Badge tone="violet">{t("wh_all_events")}</Badge>
							) : (
								<Badge tone="cyan">{L(`${sel.length} رویداد`, `${sel.length} selected`)}</Badge>
							)}
						</div>

						<div className="scrollbar-thin max-h-[320px] space-y-4 overflow-y-auto pe-1">
							{groups.map((g) => {
								const on = g.items.filter((x) => sel.includes(x)).length
								return (
									<div key={g.group}>
										<div className="mb-2 flex flex-wrap items-center gap-2">
											<span className="mono text-xs font-medium text-fg" dir="ltr">{g.group}.*</span>
											<span className="text-xs text-muted">{on}/{g.items.length}</span>
											<button type="button" className="chip" onClick={() => setGroup(g.items, true)}>{t("all")}</button>
											<button type="button" className="chip" onClick={() => setGroup(g.items, false)}>{L("هیچ‌کدام", "None")}</button>
										</div>
										<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
											{g.items.map((ev) => (
												<button key={ev} type="button" dir="ltr" onClick={() => toggle(ev)} className={cx("pick mono text-xs", sel.includes(ev) && "pick-on")}>
													{ev}
												</button>
											))}
										</div>
									</div>
								)
							})}
							{groups.length === 0 && <div className="text-xs text-muted">{t("nothing_here")}</div>}
						</div>
					</div>
				</Field>
			</form>
		</Modal>
	)
}
