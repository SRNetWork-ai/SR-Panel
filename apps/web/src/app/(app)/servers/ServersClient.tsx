"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Activity, HardDrive, Plug, RefreshCw, Search, Server as ServerIcon, Users } from "lucide-react"
import { ApiError, api } from "@/lib/client"
import type { ServerDto } from "@/lib/dto"
import { formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Button, Card, Empty, Input, PageHeader, Select, cx, useConfirm, useToast } from "@/components/ui"
import { MiniStat } from "@/components/bits"
import { ServerCard } from "./ServerCard"
import { ServerFormModal } from "./ServerFormModal"
import { Tilt } from "./Tilt"
import { tr, type ServerFilter, type ServerSort } from "./types"

export function ServersClient({ initial }: { initial: ServerDto[] }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const confirm = useConfirm()
	const router = useRouter()
	const [servers, setServers] = useState(initial)
	const [editing, setEditing] = useState<ServerDto | "new" | null>(null)
	const [syncing, setSyncing] = useState<string | null>(null)
	const [syncingAll, setSyncingAll] = useState(false)
	const [q, setQ] = useState("")
	const [filter, setFilter] = useState<ServerFilter>("all")
	const [sort, setSort] = useState<ServerSort>("name")

	const totals = useMemo(
		() => ({
			count: servers.length,
			online: servers.filter((s) => s.status === "ONLINE").length,
			inbounds: servers.reduce((n, s) => n + s.inbounds.length, 0),
			clients: servers.reduce((n, s) => n + (s.clientCount ?? 0), 0),
		}),
		[servers],
	)

	const rows = useMemo(() => {
		const needle = q.trim().toLowerCase()
		const list = servers.filter((s) => {
			if (needle && !`${s.name} ${s.baseUrl} ${s.publicHost ?? ""}`.toLowerCase().includes(needle)) return false
			if (filter === "active") return s.isActive
			if (filter === "inactive") return !s.isActive
			if (filter === "online") return s.status === "ONLINE"
			if (filter === "offline") return s.status !== "ONLINE"
			if (filter === "error") return !!s.lastError
			return true
		})
		return [...list].sort((a, b) => {
			if (sort === "weight") return b.weight - a.weight
			if (sort === "clients") return (b.clientCount ?? 0) - (a.clientCount ?? 0)
			if (sort === "inbounds") return b.inbounds.length - a.inbounds.length
			return a.name.localeCompare(b.name)
		})
	}, [servers, q, filter, sort])

	const filters: Array<{ id: ServerFilter; label: string }> = [
		{ id: "all", label: L("همه", "All") },
		{ id: "active", label: t("active") },
		{ id: "inactive", label: t("inactive") },
		{ id: "online", label: L("آنلاین", "Online") },
		{ id: "offline", label: L("آفلاین", "Offline") },
		{ id: "error", label: L("خطادار", "With errors") },
	]

	async function sync(s: ServerDto) {
		setSyncing(s.id)
		try {
			const r = await api<{ ok: boolean; inbounds?: number; error?: string; server: ServerDto }>(`/api/servers/${s.id}/sync`, { method: "POST" })
			setServers((l) => l.map((x) => (x.id === s.id ? { ...r.server, clientCount: x.clientCount } : x)))
			if (r.ok) toast.ok(t("srv_test_ok", { n: r.inbounds ?? 0 }))
			else toast.err(r.error || t("error_generic"))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		} finally {
			setSyncing(null)
		}
	}

	async function syncAll() {
		setSyncingAll(true)
		try {
			for (const s of rows) await sync(s)
		} finally {
			setSyncingAll(false)
		}
	}

	async function remove(s: ServerDto) {
		if (!confirm(t("srv_delete_warn") + "\n\n" + t("confirm_delete"))) return
		try {
			await api(`/api/servers/${s.id}`, { method: "DELETE" })
			setServers((l) => l.filter((x) => x.id !== s.id))
		} catch (err) {
			toast.err(err instanceof ApiError ? err.message : t("error_generic"))
		}
	}

	return (
		<div className="space-y-5 fade-up">
			<PageHeader
				title={t("srv_title")}
				subtitle={t("srv_sub")}
				actions={
					<div className="flex flex-wrap items-center gap-2">
						{servers.length > 0 && (
							<Button type="button" size="sm" variant="ghost" onClick={syncAll} loading={syncingAll} title={t("srv_sync")}>
								{!syncingAll && <RefreshCw className="h-4 w-4" />} {L("همگام‌سازی همه", "Sync all")}
							</Button>
						)}
						<Button type="button" variant="primary" onClick={() => setEditing("new")}><Plug className="h-4 w-4" /> {t("srv_add")}</Button>
					</div>
				}
			/>

			{servers.length > 0 && (
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<MiniStat icon={<ServerIcon className="h-4 w-4" />} label={t("srv_title")} value={formatNumber(totals.count, locale)} />
					<MiniStat icon={<Activity className="h-4 w-4" />} label={L("آنلاین", "Online")} value={`${formatNumber(totals.online, locale)} / ${formatNumber(totals.count, locale)}`} tone={totals.online === totals.count ? "success" : "warning"} />
					<MiniStat icon={<HardDrive className="h-4 w-4" />} label={t("srv_inbounds")} value={formatNumber(totals.inbounds, locale)} tone="violet" />
					<MiniStat icon={<Users className="h-4 w-4" />} label={t("nav_clients")} value={formatNumber(totals.clients, locale)} tone="cyan" />
				</div>
			)}

			{servers.length === 0 ? (
				<Card>
					<Empty text={t("srv_empty")} action={<Button type="button" variant="primary" size="sm" onClick={() => setEditing("new")}>{t("srv_add")}</Button>} />
				</Card>
			) : (
				<>
					<div className="glass flex flex-wrap items-center gap-2 p-3">
						<div className="relative min-w-[12rem] flex-1">
							<Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
							<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("srv_name")} className="ps-9" />
						</div>
						<div className="flex flex-wrap gap-1.5">
							{filters.map((f) => (
								<button type="button" key={f.id} onClick={() => setFilter(f.id)} className={cx("chip", filter === f.id && "chip-on")}>{f.label}</button>
							))}
						</div>
						<Select value={sort} onChange={(e) => setSort(e.target.value as ServerSort)} className="w-auto">
							<option value="name">{t("srv_name")}</option>
							<option value="weight">{t("srv_weight")}</option>
							<option value="clients">{t("nav_clients")}</option>
							<option value="inbounds">{t("srv_inbounds")}</option>
						</Select>
					</div>

					{rows.length === 0 ? (
						<Card><Empty text={t("nothing_here")} /></Card>
					) : (
						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							{rows.map((s) => (
								<Tilt key={s.id}>
									<ServerCard s={s} syncing={syncing === s.id} onSync={() => sync(s)} onEdit={() => setEditing(s)} onRemove={() => remove(s)} />
								</Tilt>
							))}
						</div>
					)}
				</>
			)}

			<ServerFormModal
				editing={editing}
				onClose={() => setEditing(null)}
				onSaved={(s, isNew) => {
					setServers((l) => (isNew ? [s, ...l] : l.map((x) => (x.id === s.id ? { ...x, ...s } : x))))
					setEditing(null)
					setTimeout(() => router.refresh(), 2500)
				}}
			/>
		</div>
	)
}
