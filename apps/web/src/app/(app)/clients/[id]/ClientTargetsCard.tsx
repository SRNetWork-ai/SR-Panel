"use client"

import { useEffect, useMemo, useState } from "react"
import { RefreshCw, Save, Server as ServerIcon, Undo2 } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import type { ClientDto } from "@/lib/dto"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Spinner, useToast } from "@/components/ui"

type Option = {
	serverId: string
	serverName: string
	status: string
	isActive: boolean
	inbounds: Array<{ id: number; label: string; protocol: string; port: number; enable: boolean }>
}

const keyOf = (serverId: string, inboundId: number) => `${serverId}:${inboundId}`
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((k) => b.has(k))

/**
 * «سرورها و اینباندها» — attach or detach an already created client. Inbounds picked
 * on the same server become one config (the panel keeps a single client on many inbounds),
 * so the traffic counters survive as long as that config stays.
 */
export function ClientTargetsCard({ client, onChange }: { client: ClientDto; onChange: (c: ClientDto) => void }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const toast = useToast()
	const [options, setOptions] = useState<Option[] | null>(null)
	const current = useMemo(() => new Set(client.servers.map((s) => keyOf(s.serverId, s.inboundId))), [client.servers])
	const [sel, setSel] = useState<Set<string>>(current)
	const [busy, setBusy] = useState("")
	const msg = (e: unknown) => (e instanceof ApiError ? e.message : t("error_generic"))

	useEffect(() => setSel(current), [current])

	const load = async (notify = false) => {
		setBusy("load")
		try {
			setOptions(await api<Option[]>(`/api/clients/${client.id}/targets`))
		} catch (e) {
			if (notify) toast.err(msg(e))
		} finally {
			setBusy("")
		}
	}

	useEffect(() => {
		void load()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [client.id])

	const toggle = (serverId: string, inboundId: number) => {
		const k = keyOf(serverId, inboundId)
		const next = new Set(sel)
		if (next.has(k)) next.delete(k)
		else next.add(k)
		setSel(next)
	}

	const dirty = !sameSet(sel, current)
	const addedCount = [...sel].filter((k) => !current.has(k)).length
	const removedCount = [...current].filter((k) => !sel.has(k)).length

	const save = async () => {
		if (!sel.size) {
			toast.err(L("دست‌کم یک اینباند باید انتخاب شود", "Pick at least one inbound"))
			return
		}
		setBusy("save")
		try {
			const targets = [...sel].map((k) => {
				const [serverId, inboundId] = k.split(":")
				return { serverId: serverId!, inboundId: Number(inboundId) }
			})
			const r = await api<{ client: ClientDto; errors: string[] }>(`/api/clients/${client.id}/targets`, { method: "PUT", json: { targets } })
			onChange(r.client)
			r.errors.length ? toast.err(r.errors.join(" | ")) : toast.ok(t("set_saved"))
		} catch (e) {
			toast.err(msg(e))
		} finally {
			setBusy("")
		}
	}

	return (
		<Card
			title={L("سرورها و اینباندها", "Servers & inbounds")}
			subtitle={L("افزودن یا حذف اینباند بدون ساخت دوبارهٔ کلاینت", "Attach or detach inbounds without re-creating the client")}
			actions={
				dirty ? (
					<Badge tone="warning">{`+${addedCount} / -${removedCount}`}</Badge>
				) : (
					<Badge tone="muted">{`${current.size} ${L("اینباند", "inbounds")}`}</Badge>
				)
			}
		>
			{!options ? (
				<div className="flex justify-center py-4">
					<Spinner />
				</div>
			) : options.length === 0 ? (
				<p className="text-sm text-muted">{L("سروری در دسترس شما نیست", "No server available to you")}</p>
			) : (
				<ul className="space-y-2">
					{options.map((s) => (
						<li key={s.serverId} className="glass glass-2 p-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex items-center gap-1.5 text-sm font-medium">
									<ServerIcon className="h-3.5 w-3.5" />
									{s.serverName}
								</div>
								{!s.isActive && <Badge tone="muted">{t("disabled")}</Badge>}
							</div>
							{s.inbounds.length === 0 ? (
								<p className="mt-2 text-xs text-muted">{L("اینباندی در دسترس نیست", "No inbound available")}</p>
							) : (
								<div className="mt-2 flex flex-wrap gap-1.5">
									{s.inbounds.map((i) => {
										const k = keyOf(s.serverId, i.id)
										const on = sel.has(k)
										return (
											<button
												key={i.id}
												type="button"
												disabled={!s.isActive && !on}
												className={`badge cursor-pointer ${on ? "badge-cyan" : "badge-muted"}`}
												onClick={() => toggle(s.serverId, i.id)}
												title={`#${i.id} • ${i.protocol} • ${i.port}`}
											>
												{i.label || `#${i.id}`} <span className="mono opacity-70">{i.protocol}</span>
												{!i.enable && <span className="opacity-70"> • {t("disabled")}</span>}
											</button>
										)
									})}
								</div>
							)}
						</li>
					))}
				</ul>
			)}

			<p className="mt-3 text-xs text-muted">
				{L(
					"چند اینباند روی یک سرور یک کانفیگ محسوب می‌شود و مصرف قبلی حفظ می‌شود؛ حذف آخرین اینباند یک سرور، کانفیگ را از آن پنل پاک می‌کند.",
					"Several inbounds on one server are a single config and keep their usage; removing the last inbound of a server deletes that config from the panel.",
				)}
			</p>

			<div className="mt-4 flex flex-wrap items-center gap-2">
				<Button variant="primary" loading={busy === "save"} disabled={!dirty} onClick={save}>
					<Save className="h-4 w-4" />
					{t("save")}
				</Button>
				{dirty && (
					<Button onClick={() => setSel(current)}>
						<Undo2 className="h-4 w-4" />
						{L("بازگرداندن", "Revert")}
					</Button>
				)}
				<Button loading={busy === "load"} onClick={() => load(true)}>
					<RefreshCw className="h-4 w-4" />
					{L("به‌روزرسانی", "Refresh")}
				</Button>
			</div>
		</Card>
	)
}
