"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, DownloadCloud, RefreshCw } from "lucide-react"
import { api } from "@/lib/client"
import { Badge, Button, Card, Empty, PageHeader, Spinner, useToast } from "@/components/ui"

type Row = {
	email: string
	uuid: string
	protocol: string
	inboundIds: number[]
	totalBytes: number
	expiresAt: string | null
	pendingDays: number
	limitIp: number
	enable: boolean
	up: number
	down: number
	tgId: string
	linked: boolean
	uuidTaken: boolean
	importable: boolean
}

type Scan = {
	server: { id: string; name: string; baseUrl: string }
	rows: Row[]
	total: number
	linkedCount: number
	importableCount: number
}

type ImportResult = { imported: number; skipped: number; errors: string[]; clientIds: string[] }

const GB = 1024 ** 3

function volume(bytes: number): string {
	if (!bytes) return "نامحدود"
	return `${(bytes / GB).toFixed(bytes < GB ? 2 : 1)} GB`
}

function expiryOf(row: Row): string {
	if (row.pendingDays > 0) return `${row.pendingDays} روز پس از اولین اتصال`
	if (!row.expiresAt) return "بدون انقضا"
	return new Date(row.expiresAt).toLocaleDateString("fa-IR")
}

function stateOf(row: Row): { tone: "success" | "muted" | "warning"; text: string } {
	if (row.linked) return { tone: "muted", text: "قبلاً مدیریت می‌شود" }
	if (row.uuidTaken) return { tone: "warning", text: "UUID تکراری" }
	if (!row.uuid) return { tone: "warning", text: "بدون شناسه" }
	return { tone: "success", text: "قابل ایمپورت" }
}

/**
 * Owner-only screen: reads the panel's own client list and copies the picked ones into
 * SRPanel. The panel is never written to, so importing cannot break a live customer.
 */
export function ImportClientsClient({ serverId, serverName }: { serverId: string; serverName: string }) {
	const toast = useToast()
	const [scan, setScan] = useState<Scan | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [busy, setBusy] = useState(false)
	const [picked, setPicked] = useState<string[]>([])
	const [tick, setTick] = useState(0)

	useEffect(() => {
		let alive = true
		setLoading(true)
		setError(null)
		api<Scan>(`/api/servers/${serverId}/import`)
			.then((data) => {
				if (!alive) return
				setScan(data)
				setPicked(data.rows.filter((r) => r.importable).map((r) => r.email))
			})
			.catch((err: unknown) => {
				if (!alive) return
				setScan(null)
				setError(err instanceof Error ? err.message : "خواندن پنل ناموفق بود")
			})
			.finally(() => {
				if (alive) setLoading(false)
			})
		return () => {
			alive = false
		}
	}, [serverId, tick])

	const importable = useMemo(() => (scan?.rows ?? []).filter((r) => r.importable), [scan])
	const allPicked = importable.length > 0 && picked.length === importable.length

	function toggle(email: string) {
		setPicked((list) => (list.includes(email) ? list.filter((e) => e !== email) : [...list, email]))
	}

	async function runImport() {
		if (!picked.length) return
		setBusy(true)
		try {
			const res = await api<ImportResult>(`/api/servers/${serverId}/import`, { method: "POST", json: { emails: picked } })
			toast.ok(`${res.imported} کلاینت ایمپورت شد`)
			if (res.errors.length) toast.err(res.errors.slice(0, 3).join(" | "))
			setTick((n) => n + 1)
		} catch (err) {
			toast.err(err instanceof Error ? err.message : "ایمپورت ناموفق بود")
		} finally {
			setBusy(false)
		}
	}

	return (
		<div>
			<PageHeader
				title={`ایمپورت کلاینت‌های ${serverName}`}
				subtitle="کلاینت‌هایی که روی خود پنل ساخته شده‌اند به SRPanel منتقل می‌شوند. روی پنل چیزی تغییر نمی‌کند."
				actions={
					<>
						<Link href={`/servers/${serverId}`} className="btn btn-sm btn-ghost">
							<ArrowRight className="h-4 w-4" />
							بازگشت
						</Link>
						<Button size="sm" variant="ghost" onClick={() => setTick((n) => n + 1)} loading={loading}>
							<RefreshCw className="h-4 w-4" />
							اسکن دوباره
						</Button>
						<Button size="sm" variant="primary" onClick={runImport} loading={busy} disabled={!picked.length}>
							<DownloadCloud className="h-4 w-4" />
							ایمپورت ({picked.length})
						</Button>
					</>
				}
			/>

			<Card
				title="کلاینت‌های پنل"
				subtitle={scan ? `${scan.total} کلاینت روی پنل • ${scan.linkedCount} قبلاً مدیریت‌شده • ${scan.importableCount} قابل ایمپورت` : undefined}
				actions={
					importable.length > 0 ? (
						<Button size="sm" variant="ghost" onClick={() => setPicked(allPicked ? [] : importable.map((r) => r.email))}>
							{allPicked ? "لغو انتخاب همه" : "انتخاب همه"}
						</Button>
					) : undefined
				}
			>
				{loading ? (
					<div className="flex justify-center py-12">
						<Spinner />
					</div>
				) : error ? (
					<Empty text={error} />
				) : !scan || !scan.rows.length ? (
					<Empty text="روی این پنل کلاینتی پیدا نشد" />
				) : (
					<div className="scrollbar-thin overflow-x-auto">
						<table className="w-full text-right text-sm">
							<thead className="text-xs text-muted">
								<tr>
									<th className="w-10 pb-2" />
									<th className="pb-2 font-medium">نام (email)</th>
									<th className="pb-2 font-medium">پروتکل</th>
									<th className="pb-2 font-medium">اینباند</th>
									<th className="pb-2 font-medium">حجم</th>
									<th className="pb-2 font-medium">مصرف</th>
									<th className="pb-2 font-medium">انقضا</th>
									<th className="pb-2 font-medium">وضعیت</th>
								</tr>
							</thead>
							<tbody>
								{scan.rows.map((row) => {
									const state = stateOf(row)
									return (
										<tr key={row.email} className="border-t border-white/5">
											<td className="py-2">
												<input
													type="checkbox"
													disabled={!row.importable}
													checked={picked.includes(row.email)}
													onChange={() => toggle(row.email)}
													aria-label={row.email}
												/>
											</td>
											<td className="py-2">
												<div className="font-medium">{row.email}</div>
												{row.tgId && <div className="text-[11px] text-muted">Telegram: {row.tgId}</div>}
											</td>
											<td className="py-2 text-xs">{row.protocol}</td>
											<td className="num py-2 text-xs">{row.inboundIds.join(", ")}</td>
											<td className="num py-2 text-xs">{volume(row.totalBytes)}</td>
											<td className="num py-2 text-xs">{volume(row.up + row.down)}</td>
											<td className="py-2 text-xs">{expiryOf(row)}</td>
											<td className="py-2">
												<Badge tone={state.tone}>{state.text}</Badge>
												{!row.enable && <Badge tone="danger" className="ms-1">غیرفعال</Badge>}
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				)}
			</Card>
		</div>
	)
}
