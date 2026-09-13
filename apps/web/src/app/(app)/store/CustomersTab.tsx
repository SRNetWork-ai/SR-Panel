"use client"

import { useEffect, useState } from "react"
import { Ban, CheckCircle2, KeyRound, RefreshCw, Search, Wallet } from "lucide-react"
import { api } from "@/lib/client"
import { formatDate, formatNumber } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Modal, Spinner, Textarea, useToast } from "@/components/ui"
import { tr, type CustomerRow } from "./types"

/** Seller view of storefront accounts: wallet balance, block/unblock, password reset. */
export function CustomersTab() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [rows, setRows] = useState<CustomerRow[]>([])
	const [q, setQ] = useState("")
	const [loading, setLoading] = useState(true)
	const [busy, setBusy] = useState(false)
	const [credit, setCredit] = useState<CustomerRow | null>(null)
	const [pass, setPass] = useState<CustomerRow | null>(null)
	const [amount, setAmount] = useState("")
	const [note, setNote] = useState("")
	const [newPass, setNewPass] = useState("")

	const who = (r: CustomerRow) => r.name || r.email || r.phone || r.id.slice(0, 8)
	const fail = (e: unknown) => toast.err(e instanceof Error ? e.message : t("error_generic"))

	async function load(search: string) {
		setLoading(true)
		try {
			const d = await api<{ items: CustomerRow[] }>("/api/customers?limit=200&q=" + encodeURIComponent(search))
			setRows(d.items)
		} catch (e) {
			fail(e)
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		void load("")
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	async function submitCredit() {
		if (!credit) return
		const id = credit.id
		const n = Math.trunc(Number(amount))
		if (!Number.isFinite(n) || n === 0) {
			toast.err(L("مبلغ را وارد کنید", "Enter an amount"))
			return
		}
		setBusy(true)
		try {
			const res = await api<{ balance: string }>("/api/customers/" + id + "/credit", { method: "POST", json: { amount: n, note: note.trim() || undefined } })
			setRows((s) => s.map((r) => (r.id === id ? { ...r, credit: res.balance } : r)))
			toast.ok(L("موجودی کیف پول به‌روز شد", "Wallet balance updated"))
			setCredit(null)
			setAmount("")
			setNote("")
		} catch (e) {
			fail(e)
		} finally {
			setBusy(false)
		}
	}

	async function submitPassword() {
		if (!pass) return
		if (newPass.length < 6) {
			toast.err(L("رمز عبور باید حداقل ۶ کاراکتر باشد", "At least 6 characters"))
			return
		}
		setBusy(true)
		try {
			await api("/api/customers/" + pass.id + "/password", { method: "POST", json: { password: newPass } })
			toast.ok(L("رمز عبور عوض شد و نشست‌ها بسته شد", "Password reset, sessions closed"))
			setPass(null)
			setNewPass("")
		} catch (e) {
			fail(e)
		} finally {
			setBusy(false)
		}
	}

	async function toggleStatus(r: CustomerRow) {
		const status = r.status === "ACTIVE" ? "BLOCKED" : "ACTIVE"
		setBusy(true)
		try {
			await api("/api/customers/" + r.id + "/status", { method: "POST", json: { status } })
			setRows((s) => s.map((x) => (x.id === r.id ? { ...x, status } : x)))
			toast.ok(status === "ACTIVE" ? L("حساب فعال شد", "Account unblocked") : L("حساب مسدود شد", "Account blocked"))
		} catch (e) {
			fail(e)
		} finally {
			setBusy(false)
		}
	}

	const totalCredit = rows.reduce((a, r) => a + Number(r.credit), 0)

	return (
		<div className="space-y-4">
			<Card
				title={L("مشتریان فروشگاه", "Store customers")}
				subtitle={L("حساب‌های ثبت‌نام‌شده در فروشگاه و کیف پول آن‌ها", "Registered storefront accounts and their wallets")}
				actions={
					<>
						<form
							className="flex items-center gap-2"
							onSubmit={(e) => {
								e.preventDefault()
								void load(q)
							}}
						>
							<Input className="w-40" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("نام، ایمیل، موبایل…", "Name, email, phone…")} />
							<Button type="submit" size="sm" title={L("جستجو", "Search")}>
								<Search className="h-4 w-4" />
							</Button>
						</form>
						<Button type="button" size="sm" variant="ghost" title={L("بازخوانی", "Reload")} onClick={() => void load(q)}>
							<RefreshCw className="h-4 w-4" />
						</Button>
					</>
				}
			>
				{loading ? (
					<div className="flex items-center justify-center py-10">
						<Spinner />
					</div>
				) : rows.length === 0 ? (
					<Empty text={L("هنوز مشتری‌ای ثبت‌نام نکرده است", "No customer accounts yet")} />
				) : (
					<div className="space-y-2">
						{rows.map((r) => (
							<div key={r.id} className="tile grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<span className="truncate text-sm font-semibold">{who(r)}</span>
										<Badge tone={r.status === "ACTIVE" ? "success" : "danger"}>{r.status === "ACTIVE" ? L("فعال", "Active") : L("مسدود", "Blocked")}</Badge>
									</div>
									<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
										{r.email && <span className="mono">{r.email}</span>}
										{r.phone && <span className="mono">{r.phone}</span>}
										{r.telegramId && <span className="mono">{"TG " + r.telegramId}</span>}
										<span>{L("ثبت‌نام ", "Joined ") + formatDate(r.createdAt, locale)}</span>
										<span>{L("آخرین ورود ", "Last login ") + formatDate(r.lastLoginAt, locale)}</span>
									</div>
								</div>
								<div className="flex items-center gap-5 text-xs">
									<div>
										<div className="text-muted">{L("کیف پول", "Wallet")}</div>
										<div className="num font-semibold">{formatNumber(Number(r.credit), locale)}</div>
									</div>
									<div>
										<div className="text-muted">{L("سفارش", "Orders")}</div>
										<div className="num font-semibold">{formatNumber(r.orders, locale)}</div>
									</div>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onClick={() => {
											setCredit(r)
											setAmount("")
											setNote("")
										}}
									>
										<Wallet className="h-4 w-4" /> {L("شارژ / کسر", "Adjust")}
									</Button>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onClick={() => {
											setPass(r)
											setNewPass("")
										}}
									>
										<KeyRound className="h-4 w-4" /> {L("رمز", "Password")}
									</Button>
									<Button type="button" size="sm" variant={r.status === "ACTIVE" ? "danger" : "default"} disabled={busy} onClick={() => void toggleStatus(r)}>
										{r.status === "ACTIVE" ? (
											<>
												<Ban className="h-4 w-4" /> {L("مسدود", "Block")}
											</>
										) : (
											<>
												<CheckCircle2 className="h-4 w-4" /> {L("فعال‌سازی", "Unblock")}
											</>
										)}
									</Button>
								</div>
							</div>
						))}
						<div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1 text-[11px] text-muted">
							<span>{L("تعداد مشتری: ", "Customers: ") + formatNumber(rows.length, locale)}</span>
							<span>{L("جمع موجودی کیف پول‌ها: ", "Total wallet balance: ") + formatNumber(totalCredit, locale)}</span>
						</div>
					</div>
				)}
			</Card>

			<Modal
				open={credit !== null}
				onClose={() => setCredit(null)}
				title={L("تغییر موجودی کیف پول", "Adjust wallet balance")}
				subtitle={credit ? who(credit) : ""}
				footer={
					<>
						<Button type="button" variant="ghost" onClick={() => setCredit(null)}>
							{t("cancel")}
						</Button>
						<Button type="button" variant="primary" loading={busy} onClick={() => void submitCredit()}>
							{t("save")}
						</Button>
					</>
				}
			>
				<div className="space-y-3">
					<div className="tile text-xs text-muted">{L("موجودی فعلی: ", "Current balance: ") + (credit ? formatNumber(Number(credit.credit), locale) : "0")}</div>
					<Field label={L("مبلغ", "Amount")} hint={L("عدد منفی = کسر از کیف پول", "A negative number takes credit back")}>
						<Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100000" />
					</Field>
					<Field label={L("توضیح (در تاریخچهٔ مشتری دیده می‌شود)", "Note (visible in the customer ledger)")}>
						<Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
					</Field>
				</div>
			</Modal>

			<Modal
				open={pass !== null}
				onClose={() => setPass(null)}
				title={L("تغییر رمز مشتری", "Reset customer password")}
				subtitle={pass ? who(pass) : ""}
				footer={
					<>
						<Button type="button" variant="ghost" onClick={() => setPass(null)}>
							{t("cancel")}
						</Button>
						<Button type="button" variant="primary" loading={busy} onClick={() => void submitPassword()}>
							{t("save")}
						</Button>
					</>
				}
			>
				<Field label={L("رمز جدید", "New password")} hint={L("حداقل ۶ کاراکتر؛ با تغییر رمز، همهٔ نشست‌های مشتری بسته می‌شود", "At least 6 characters; all customer sessions are closed")}>
					<Input dir="ltr" type="text" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
				</Field>
			</Modal>
		</div>
	)
}
