"use client"

import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { Badge, Button, Card, Field, Input, Spinner, Switch, useToast } from "@/components/ui"
import { ApiError, api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { tr } from "./types"

type Entry = { id: string; enabled: boolean; title: string; kind: "uri" | "sub"; value: string }
type Status = { id: string; title: string; kind: "uri" | "sub"; count: number; error: string }
type Book = { entries: Entry[]; statuses: Status[]; total: number }
type SaveInput = { id?: string; enabled?: boolean; title?: string; value: string }

const ENDPOINT = "/api/settings/external-links"

/**
 * Owner-only: nodes and whole subscriptions that are not ours, merged into the
 * subscription of every client. Turning an entry off removes it everywhere at once.
 */
export function ExternalLinksTab() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [book, setBook] = useState<Book | null>(null)
	const [title, setTitle] = useState("")
	const [value, setValue] = useState("")
	const [busy, setBusy] = useState(false)
	const [testing, setTesting] = useState(false)
	const msg = (e: unknown) => (e instanceof ApiError ? e.message : t("error_generic"))

	const load = async () => {
		try {
			setBook(await api<Book>(ENDPOINT))
		} catch (e) {
			toast.err(msg(e))
		}
	}

	useEffect(() => {
		void load()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const save = async (input: SaveInput): Promise<boolean> => {
		if (busy) return false
		setBusy(true)
		try {
			await api(ENDPOINT, { method: "PUT", json: input })
			await load()
			toast.ok(t("set_saved"))
			return true
		} catch (e) {
			toast.err(msg(e))
			return false
		} finally {
			setBusy(false)
		}
	}

	const add = async () => {
		const raw = value.trim()
		if (!raw) return
		if (await save({ title: title.trim(), value: raw })) {
			setTitle("")
			setValue("")
		}
	}

	/** the test button: resolve the value without storing it */
	const probe = async () => {
		const raw = value.trim()
		if (!raw || testing) return
		setTesting(true)
		try {
			const r = await api<{ ok: boolean; count: number; error: string }>(ENDPOINT, { method: "POST", json: { value: raw } })
			if (r.ok) toast.ok(`${r.count} ${L("نود پیدا شد", "nodes found")}`)
			else toast.err(r.error || L("چیزی پیدا نشد", "Nothing found"))
		} catch (e) {
			toast.err(msg(e))
		} finally {
			setTesting(false)
		}
	}

	const remove = async (id: string) => {
		try {
			await api(`${ENDPOINT}?id=${encodeURIComponent(id)}`, { method: "DELETE" })
			await load()
		} catch (e) {
			toast.err(msg(e))
		}
	}

	if (!book)
		return (
			<Card title={L("لینک‌های خارجی", "External links")}>
				<div className="flex justify-center p-6">
					<Spinner />
				</div>
			</Card>
		)

	return (
		<div className="space-y-6">
			<Card
				title={L("لینک‌های خارجی", "External links")}
				subtitle={L("افزودن نود یا ساب‌سکریپشن خارجی به اشتراک همه مشتری‌ها", "Extra nodes merged into every client subscription")}
				actions={<Badge tone={book.total > 0 ? "success" : "warning"}>{`${book.total} ${L("نود", "nodes")}`}</Badge>}
			>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label={L("عنوان (اختیاری)", "Title (optional)")}>
						<Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={L("سرور شریک", "Partner node")} />
					</Field>
					<Field
						label={L("لینک", "Link")}
						hint={L("یک لینک نود یا آدرس یک ساب‌سکریپشن", "A node URI or a subscription URL")}
					>
						<Input dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} placeholder="vless://... | https://..." />
					</Field>
				</div>
				<div className="mt-4 flex flex-wrap items-center gap-3">
					<Button size="sm" variant="ghost" onClick={probe} loading={testing}>
						{L("تست", "Test")}
					</Button>
					<div className="flex-1" />
					<Button onClick={add} loading={busy}>
						{L("افزودن", "Add")}
					</Button>
				</div>
			</Card>

			<Card
				title={L("لینک‌های ثبت‌شده", "Saved links")}
				subtitle={L("خاموش‌کردن یک لینک، بلافاصله آن را از اشتراک همه حذف می‌کند", "Turning one off removes it from every subscription")}
			>
				{book.entries.length === 0 ? (
					<p className="text-xs text-muted">{L("هنوز چیزی اضافه نشده است.", "Nothing added yet.")}</p>
				) : (
					<div className="space-y-2">
						{book.entries.map((item) => {
							const st = book.statuses.find((s) => s.id === item.id)
							const note = !item.enabled ? "—" : st?.error ? st.error : `${st?.count ?? 0} ${L("نود", "nodes")}`
							return (
								<div key={item.id} className="glass-2 flex flex-wrap items-center gap-3 p-3">
									<Badge>{item.kind === "sub" ? L("ساب", "sub") : L("نود", "node")}</Badge>
									<div className="min-w-0 flex-1">
										<div className="truncate text-sm">{item.title || (item.kind === "sub" ? L("ساب‌سکریپشن", "Subscription") : L("نود", "Node"))}</div>
										<div dir="ltr" className="truncate text-[11px] text-muted">{item.value}</div>
									</div>
									<span className="text-[11px] text-muted">{note}</span>
									<Switch
										checked={item.enabled}
										onChange={() => void save({ id: item.id, enabled: !item.enabled, title: item.title, value: item.value })}
										label={L("فعال", "On")}
									/>
									<Button size="icon" variant="danger" onClick={() => void remove(item.id)} aria-label={L("حذف", "Delete")}>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							)
						})}
					</div>
				)}
			</Card>
		</div>
	)
}
