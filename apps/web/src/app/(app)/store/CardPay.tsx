"use client"

import { useState } from "react"
import { AlertTriangle, Banknote, Landmark, Link2, Plus, RefreshCw, RotateCw, X } from "lucide-react"
import { api } from "@/lib/client"
import { formatNumber, relativeTime } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Select, SubHead, Switch, cx, useToast } from "@/components/ui"
import { CopyBtn } from "./parts"
import { BANK_LABEL, CARD_MODE_LABEL, DEPOSIT_LABEL, DEPOSIT_TONE, tr, type BankProvider, type BankSyncResult, type CardDto, type CardVerifyMode, type DepositDto, type StoreSettings } from "./types"

const MODES: CardVerifyMode[] = ["MANUAL", "SMS", "BANK"]
const PROVIDERS: BankProvider[] = ["NONE", "HAMRAHBANK", "CUSTOM"]

type Props = {
	s: StoreSettings
	onStore: (p: Partial<StoreSettings>) => void
	card: CardDto
	onCard: (p: Partial<CardDto>) => void
	secret: string
	onSecret: (v: string) => void
}

/** Card-to-card settings + automatic confirmation (bank SMS webhook or a statement bridge). */
export function CardPay({ s, onStore, card, onCard, secret, onSecret }: Props) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const [busy, setBusy] = useState("")
	const [sender, setSender] = useState("")
	const [amount, setAmount] = useState("")
	const [refId, setRefId] = useState("")
	const [last4, setLast4] = useState("")

	const oops = (e: unknown) => toast.err(e instanceof Error ? e.message : t("error_generic"))
	const modeLabel = (m: CardVerifyMode) => L(CARD_MODE_LABEL[m].fa, CARD_MODE_LABEL[m].en)
	const manual = card.mode === "MANUAL"

	async function webhook(rotate: boolean) {
		setBusy(rotate ? "rotate" : "token")
		try {
			const r = await api<{ token: string; webhookUrl: string }>("/api/store/webhook", { method: "POST", json: { rotate } })
			onCard({ smsToken: r.token, webhookUrl: r.webhookUrl })
			toast.ok(rotate ? L("لینک جدید ساخته شد", "New link created") : L("لینک آماده است", "Link ready"))
		} catch (e) {
			oops(e)
		} finally {
			setBusy("")
		}
	}

	async function syncBank() {
		setBusy("sync")
		try {
			const r = await api<BankSyncResult>("/api/store/bank", { method: "POST", json: {} })
			const fresh = await api<{ deposits: DepositDto[]; card: CardDto }>("/api/store/deposits")
			onCard(fresh.card)
			if (r.ok) toast.ok(L(r.imported + " واریز جدید · " + r.matched + " تطبیق", r.imported + " new · " + r.matched + " matched"))
			else toast.err(r.error || t("error_generic"))
		} catch (e) {
			oops(e)
		} finally {
			setBusy("")
		}
	}

	async function rematch() {
		setBusy("rematch")
		try {
			const r = await api<{ matched?: number; deposits: DepositDto[] }>("/api/store/deposits", { method: "PATCH", json: {} })
			onCard({ deposits: r.deposits })
			toast.ok(L("بازبینی انجام شد · " + (r.matched ?? 0) + " تطبیق", "Re-checked · " + (r.matched ?? 0) + " matched"))
		} catch (e) {
			oops(e)
		} finally {
			setBusy("")
		}
	}

	async function addDeposit() {
		const value = Math.round(Number(amount.replace(/[^0-9]/g, "")))
		if (!Number.isFinite(value) || value <= 0) {
			toast.err(L("مبلغ واریز را وارد کنید", "Enter the deposit amount"))
			return
		}
		setBusy("manual")
		try {
			const r = await api<{ status?: string; deposits: DepositDto[] }>("/api/store/deposits", {
				method: "POST",
				json: { amount: value, refId: refId.trim() || undefined, last4: last4.trim() || undefined },
			})
			onCard({ deposits: r.deposits })
			setAmount("")
			setRefId("")
			setLast4("")
			toast.ok(r.status === "MATCHED" ? L("واریز به سفارش وصل و تأیید شد", "Matched and confirmed") : L("واریز ثبت شد", "Deposit stored"))
		} catch (e) {
			oops(e)
		} finally {
			setBusy("")
		}
	}

	function addSender() {
		const v = sender.trim()
		if (!v) return
		if (!card.senders.includes(v)) onCard({ senders: [...card.senders, v] })
		setSender("")
	}

	return (
		<Card title={t("pay_m_CARD")} subtitle={t("pay_card_sub")} actions={<Switch checked={s.cardEnabled} onChange={(v) => onStore({ cardEnabled: v })} />}>
			<div className={cx("space-y-5 transition", !s.cardEnabled && "opacity-60")}>
				<div className="grid gap-3 md:grid-cols-3">
					<Field label={t("pay_card_number")}>
						<div className="flex gap-2">
							<Input dir="ltr" className="mono" inputMode="numeric" value={s.cardNumber ?? ""} onChange={(e) => onStore({ cardNumber: e.target.value })} placeholder="6037 …" />
							{s.cardNumber ? <CopyBtn value={s.cardNumber} /> : null}
						</div>
					</Field>
					<Field label={t("pay_card_holder")}>
						<Input value={s.cardHolder ?? ""} onChange={(e) => onStore({ cardHolder: e.target.value })} />
					</Field>
					<Field label={t("pay_card_bank")}>
						<Input value={s.cardBank ?? ""} onChange={(e) => onStore({ cardBank: e.target.value })} />
					</Field>
				</div>

				<div className="space-y-2">
					<SubHead title={L("روش تأیید واریز", "Confirmation method")} hint={L("با تأیید خودکار، سرویس بلافاصله پس از واریز ساخته می‌شود", "Auto mode provisions the service right after the deposit")} />
					<div className="flex flex-wrap gap-2">
						{MODES.map((m) => (
							<button key={m} type="button" className={cx("chip", card.mode === m && "chip-on")} onClick={() => onCard({ mode: m })}>
								{modeLabel(m)}
							</button>
						))}
						{card.lastError ? (
							<span className="inline-flex items-center gap-1.5 text-[11px] text-danger">
								<AlertTriangle className="h-3.5 w-3.5" /> {card.lastError}
							</span>
						) : null}
					</div>
				</div>

				{manual ? (
					<div className="text-xs text-muted">{L("هر واریز باید در فهرست سفارش‌ها دستی تأیید شود.", "Every deposit must be confirmed by hand in the orders list.")}</div>
				) : (
					<>
						<div className="grid gap-3 md:grid-cols-2">
							<Field label={L("پنجرهٔ زمانی تطبیق (دقیقه)", "Match window (min)")} hint={L("فاصلهٔ مجاز بین سفارش و واریز", "Allowed gap between order and deposit")}>
								<Input type="number" min={5} max={1440} value={card.windowMin} onChange={(e) => onCard({ windowMin: Number(e.target.value) })} />
							</Field>
							<Field label={L("خطای مجاز مبلغ (تومان)", "Amount tolerance (Toman)")} hint={L("اختلاف قابل قبول مبلغ واریزی", "Accepted difference in the paid amount")}>
								<Input type="number" min={0} max={100000} step="500" value={card.toleranceIrt} onChange={(e) => onCard({ toleranceIrt: Number(e.target.value) })} />
							</Field>
						</div>
						<div className="flex flex-wrap gap-x-6 gap-y-3">
							<Switch checked={card.autoConfirm} onChange={(v) => onCard({ autoConfirm: v })} label={L("تأیید خودکار سفارش پس از تطبیق", "Auto-confirm on match")} />
							<Switch checked={card.uniqueAmount} onChange={(v) => onCard({ uniqueAmount: v })} label={L("مبلغ یکتا برای هر سفارش", "Unique amount per order")} />
							<Switch checked={card.requireLast4} onChange={(v) => onCard({ requireLast4: v })} label={L("لزوم تطابق ۴ رقم آخر کارت", "Require last 4 digits")} />
						</div>
						<div className="text-[11px] text-muted">{L("مبلغ یکتا تا ۹۹۹ تومان به فاکتور اضافه می‌کند تا دو سفارش هم‌مبلغ اشتباه نشوند.", "Unique amounts add up to 999 Toman to an invoice so two identical orders never collide.")}</div>
					</>
				)}

				{card.mode === "SMS" ? (
					<div className="space-y-3">
						<SubHead
							title={L("وب‌هوک پیامک بانک", "Bank SMS webhook")}
							hint={L("پیامک‌های واریز را با یک برنامهٔ SMS Forwarder به این آدرس بفرستید", "Forward deposit SMS to this URL with any SMS-forwarder app")}
						/>
						{card.smsToken && card.webhookUrl ? (
							<div className="tile flex flex-wrap items-center justify-between gap-2">
								<code dir="ltr" className="mono min-w-0 flex-1 truncate text-[11px]">
									{card.webhookUrl}
								</code>
								<div className="flex items-center gap-1">
									<CopyBtn value={card.webhookUrl} label={L("کپی", "Copy")} />
									<Button type="button" size="sm" variant="ghost" loading={busy === "rotate"} onClick={() => webhook(true)}>
										<RotateCw className="h-4 w-4" /> {L("تغییر توکن", "Rotate")}
									</Button>
								</div>
							</div>
						) : (
							<Button type="button" loading={busy === "token"} onClick={() => webhook(false)}>
								<Link2 className="h-4 w-4" /> {L("ساخت لینک وب‌هوک", "Create webhook link")}
							</Button>
						)}
						<ul className="space-y-1 text-[11px] text-muted">
							<li>{L("۱. برنامهٔ انتقال پیامک (SMS Forwarder / Tasker / MacroDroid) را روی گوشی دارندهٔ سیم‌کارت بانکی نصب کنید.", "1. Install an SMS forwarder app on the phone that receives the bank SMS.")}</li>
							<li>{L("۲. مقصد را این آدرس با روش POST بگذارید؛ متن خام پیامک، یا JSON با کلید text و sender هر دو پذیرفته می‌شود.", "2. POST to this URL — raw SMS text or JSON with text/sender both work.")}</li>
							<li>{L("۳. مبلغ، کد پیگیری و ۴ رقم آخر کارت از متن پیامک خوانده و با سفارش‌های در انتطار تطبیق داده می‌شود.", "3. Amount, reference code and last 4 digits are parsed and matched against pending orders.")}</li>
						</ul>
						<Field label={L("فرستندگان مجاز", "Allowed senders")} hint={L("خالی = همهٔ پیامک‌ها پردازش می‌شوند", "Empty = every incoming SMS is parsed")}>
							<div className="flex gap-2">
								<Input dir="ltr" className="mono" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="BANK.MELLAT / 6037…" />
								<Button type="button" variant="ghost" onClick={addSender}>
									<Plus className="h-4 w-4" />
								</Button>
							</div>
						</Field>
						{card.senders.length ? (
							<div className="flex flex-wrap gap-1.5">
								{card.senders.map((x) => (
									<button key={x} type="button" className="chip chip-on" onClick={() => onCard({ senders: card.senders.filter((y) => y !== x) })}>
										<span className="mono">{x}</span> <X className="h-3.5 w-3.5" />
									</button>
								))}
							</div>
						) : null}
					</div>
				) : null}

				{card.mode === "BANK" ? (
					<div className="space-y-3">
						<SubHead
							title={L("اتصال به بانک", "Bank connection")}
							hint={L("صورتحساب به صورت دوره‌ای خوانده می‌شود", "The statement is polled periodically")}
							actions={
								<Button type="button" size="sm" variant="ghost" loading={busy === "sync"} onClick={syncBank}>
									<RefreshCw className="h-4 w-4" /> {L("همگام‌سازی اکنون", "Sync now")}
								</Button>
							}
						/>
						<div className="grid gap-3 md:grid-cols-2">
							<Field label={L("سرویس‌دهنده", "Provider")}>
								<Select value={card.bankProvider} onChange={(e) => onCard({ bankProvider: e.target.value as BankProvider })}>
									{PROVIDERS.map((p) => (
										<option key={p} value={p}>
											{L(BANK_LABEL[p].fa, BANK_LABEL[p].en)}
										</option>
									))}
								</Select>
							</Field>
							<Field label={L("فاصلهٔ خواندن (دقیقه)", "Poll interval (min)")}>
								<Input type="number" min={1} max={240} value={card.bankPollMin} onChange={(e) => onCard({ bankPollMin: Number(e.target.value) })} />
							</Field>
							<div className="md:col-span-2">
								<Field label={L("آدرس API صورتحساب", "Statement API URL")} hint={L("پاسخ JSON شامل مبلغ، تاریخ و کد پیگیری", "JSON with amount, date and reference")}>
									<Input dir="ltr" className="mono" value={card.bankApiUrl} onChange={(e) => onCard({ bankApiUrl: e.target.value.trim() })} placeholder="https://bridge.example.com/deposits" />
								</Field>
							</div>
							<Field label={L("نام کاربری / شناسه", "Username / client id")}>
								<Input dir="ltr" className="mono" value={card.bankUsername} onChange={(e) => onCard({ bankUsername: e.target.value.trim() })} />
							</Field>
							<Field label={L("توکن / گذرواژه", "Token / password")} hint={card.hasBankSecret ? L("مقدار قبلی ذخیره شده است", "A value is already stored") : L("رمزنگاری‌شده نگهداری می‌شود", "Stored encrypted")}>
								<Input dir="ltr" className="mono" type="password" value={secret} onChange={(e) => onSecret(e.target.value)} placeholder={card.hasBankSecret ? "••••••••" : "…"} />
							</Field>
							<Field label={L("کارت/حساب مقصد", "Destination card/account")} hint={L("فقط واریزهای این کارت در نظر گرفته می‌شود", "Only deposits to this card are used")}>
								<Input dir="ltr" className="mono" value={card.bankCard} onChange={(e) => onCard({ bankCard: e.target.value.trim() })} placeholder="6037…" />
							</Field>
						</div>
						<div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
							<span className="inline-flex items-center gap-1.5">
								<Landmark className="h-3.5 w-3.5" /> {L("آخرین همگام‌سازی:", "Last sync:")} {card.bankLastSyncAt ? relativeTime(card.bankLastSyncAt) : "—"}
							</span>
							{card.bankProvider === "HAMRAHBANK" ? <span>{L("همراه‌بانک API عمومی ندارد؛ باید از یک پل واسط یا روش پیامک استفاده کنید.", "Hamrah Bank has no public API — use a bridge endpoint or the SMS method.")}</span> : null}
						</div>
					</div>
				) : null}

				<div className="space-y-2">
					<SubHead
						title={L("واریزهای دریافت‌شده", "Received deposits")}
						hint={L("۴۰ مورد آخر نگهداری می‌شود", "Last 40 records are kept")}
						actions={
							<Button type="button" size="sm" variant="ghost" loading={busy === "rematch"} onClick={rematch}>
								<RefreshCw className="h-4 w-4" /> {L("بازبینی تطبیق", "Re-check")}
							</Button>
						}
					/>
					<div className="grid gap-2 md:grid-cols-4">
						<Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={L("مبلغ واریز (تومان)", "Amount (Toman)")} />
						<Input dir="ltr" className="mono" value={refId} onChange={(e) => setRefId(e.target.value)} placeholder={L("کد پیگیری", "Reference")} />
						<Input dir="ltr" className="mono" value={last4} onChange={(e) => setLast4(e.target.value)} placeholder={L("۴ رقم آخر کارت", "Last 4")} />
						<Button type="button" variant="ghost" loading={busy === "manual"} onClick={addDeposit}>
							<Banknote className="h-4 w-4" /> {L("ثبت دستی واریز", "Add deposit")}
						</Button>
					</div>
					{card.deposits.length === 0 ? (
						<Empty text={L("هنوز واریزی ثبت نشده است", "No deposit recorded yet")} />
					) : (
						<div className="space-y-1.5">
							{card.deposits.slice(0, 12).map((d) => (
								<div key={d.id} className="tile flex flex-wrap items-center justify-between gap-2 py-2">
									<div className="flex min-w-0 flex-wrap items-center gap-2">
										<Badge tone={DEPOSIT_TONE[d.status]}>{L(DEPOSIT_LABEL[d.status].fa, DEPOSIT_LABEL[d.status].en)}</Badge>
										<span className="num text-sm font-semibold">
											{formatNumber(d.amount)} {t("currency_irt")}
										</span>
										{d.refId ? <code className="mono text-[11px] text-muted">#{d.refId}</code> : null}
										{d.last4 ? <code className="mono text-[11px] text-muted">****{d.last4}</code> : null}
									</div>
									<div className="flex min-w-0 items-center gap-2 text-[11px] text-muted">
										{d.note ? <span className="truncate">{d.note}</span> : null}
										<span>{d.source}</span>
										<span>{d.at ? relativeTime(d.at) : "—"}</span>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</Card>
	)
}
