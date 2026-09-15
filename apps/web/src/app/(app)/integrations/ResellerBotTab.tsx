"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Bot, ExternalLink, Lock, Pause, Play, RefreshCw, Send, Trash2, Unlock, Wallet } from "lucide-react"
import { api } from "@/lib/client"
import { formatDate } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Empty, Field, Input, Spinner, Switch, useConfirm, useToast } from "@/components/ui"
import { CopyBtn, MiniStat } from "@/components/bits"
import { errMsg, tr, type SalesBotPayload, type SalesBotRow } from "./types"

const COMMANDS = ["/start", "/shop", "/my", "/id", "/help", "/stats"]

/** Per-reseller Telegram sales bot: the owner prices and polices it, each reseller runs its own. */
export function ResellerBotTab() {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const confirm = useConfirm()
	const L = (fa: string, en: string) => tr(locale, fa, en)

	const [data, setData] = useState<SalesBotPayload | null>(null)
	const [failed, setFailed] = useState(false)
	const [cfg, setCfg] = useState<SalesBotPayload["config"]>({ enabled: false, setupPrice: 0, welcome: "" })
	const [token, setToken] = useState("")
	const [saving, setSaving] = useState(false)
	const [busy, setBusy] = useState(false)

	const load = useCallback(async () => {
		const r = await api<SalesBotPayload>("/api/settings/reseller-bots")
		setData(r)
		setCfg(r.config)
	}, [])

	useEffect(() => {
		load().catch(() => setFailed(true))
	}, [load])

	const money = (n: number) => n.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")

	async function act(json: Record<string, unknown>, okMsg: string) {
		setBusy(true)
		try {
			await api("/api/settings/reseller-bots", { method: "POST", json })
			await load()
			toast.ok(okMsg)
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setBusy(false)
		}
	}

	async function refresh() {
		setBusy(true)
		try {
			await load()
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setBusy(false)
		}
	}

	async function saveConfig(e: FormEvent) {
		e.preventDefault()
		setSaving(true)
		try {
			await api("/api/settings/reseller-bots", { method: "PUT", json: cfg })
			await load()
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setSaving(false)
		}
	}

	async function register(e: FormEvent) {
		e.preventDefault()
		const clean = token.trim()
		if (!clean) return
		await act({ token: clean }, L("ربات فروش ثبت شد", "Sales bot registered"))
		setToken("")
	}

	async function removeMine() {
		if (!(await confirm(t("confirm_delete")))) return
		await act({ remove: true }, L("ربات حذف شد", "Bot removed"))
	}

	async function removeBot(b: SalesBotRow) {
		if (!(await confirm(t("confirm_delete")))) return
		await act({ remove: true, adminId: b.adminId }, L("ربات حذف شد", "Bot removed"))
	}

	const rowLabel = (b: SalesBotRow) => (b.blocked ? L("قفل‌شده", "Locked") : b.enabled ? L("در حال اجرا", "Running") : L("متوقف", "Paused"))
	const rowTone = (b: SalesBotRow): "danger" | "success" | "cyan" => (b.blocked ? "danger" : b.enabled ? "success" : "cyan")

	if (failed) return <Empty text={L("اطلاعات ربات فروش دریافت نشد.", "Could not load sales bot data.")} />
	if (!data) return <div className="flex justify-center p-8"><Spinner /></div>

	const mine = data.mine
	const owner = data.isOwner
	const service = data.config.enabled
	const locked = !owner && (!service || mine.blocked)
	const stateLabel = mine.blocked
		? L("قفل‌شده توسط مالک", "Locked by owner")
		: !mine.hasToken
			? L("ثبت نشده", "Not set")
			: mine.enabled
				? L("در حال اجرا", "Running")
				: L("متوقف", "Paused")
	const stateTone: "danger" | "warning" | "success" | "cyan" = mine.blocked ? "danger" : !mine.hasToken ? "warning" : mine.enabled ? "success" : "cyan"

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MiniStat icon={<Bot className="h-4 w-4" />} label={L("ربات فروش من", "My sales bot")} value={stateLabel} tone={stateTone} />
				<MiniStat
					icon={<Send className="h-4 w-4" />}
					label={L("شناسه ربات", "Bot username")}
					value={mine.username ? <span className="mono text-sm" dir="ltr">@{mine.username}</span> : "—"}
					tone="cyan"
				/>
				<MiniStat icon={<Lock className="h-4 w-4" />} label={L("سرویس نمایندگان", "Reseller service")} value={service ? L("باز", "Open") : L("بسته", "Closed")} tone={service ? "success" : "warning"} />
				<MiniStat
					icon={<Wallet className="h-4 w-4" />}
					label={L("هزینهٔ فعال‌سازی", "Activation fee")}
					value={data.config.setupPrice > 0 ? money(data.config.setupPrice) + " " + L("تومان", "IRT") : L("رایگان", "Free")}
					tone="violet"
				/>
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<Card title={L("ربات فروش من", "My sales bot")} subtitle={L("ربات تلگرام اختصاصی برای فروش از فروشگاه خودتان", "A Telegram bot selling from your own storefront")}>
					<div className="space-y-4">
						{locked ? (
							<div className="tile p-3 text-sm text-muted">
								{mine.blocked
									? L("ربات فروش شما توسط مالک پنل قفل شده است.", "Your sales bot was locked by the panel owner.")
									: L("سرویس ربات فروش برای نمایندگان فعال نیست؛ با مالک پنل هماهنگ کنید.", "Reseller sales bots are disabled; contact the panel owner.")}
							</div>
						) : (
							<form onSubmit={register} className="space-y-3">
								<Field
									label={L("توکن ربات", "Bot token")}
									hint={mine.hasToken ? L("توکن ذخیره‌شده", "Saved token") + ": " + mine.tokenMasked : L("از @BotFather یک ربات بسازید و توکن آن را اینجا بگذارید.", "Create a bot in @BotFather and paste its token.")}
								>
									<div className="flex items-center gap-2">
										<Input dir="ltr" autoComplete="off" className="mono flex-1" placeholder="123456789:AA..." value={token} onChange={(e) => setToken(e.target.value)} />
										<Button type="submit" variant="primary" loading={busy} disabled={!token.trim()}>
											<Send className="h-4 w-4" /> {mine.hasToken ? L("تغییر توکن", "Replace") : L("فعال‌سازی", "Activate")}
										</Button>
									</div>
								</Field>
								{!owner && !mine.hasToken && data.config.setupPrice > 0 && (
									<div className="tile p-3 text-xs leading-6 text-muted">
										{L("با فعال‌سازی، مبلغ", "Activation charges") + " " + money(data.config.setupPrice) + " " + L("تومان یک‌بار از کیف پول شما کم می‌شود.", "IRT once from your wallet.")}
									</div>
								)}
							</form>
						)}

						{mine.hasToken && (
							<div className="tile space-y-3 p-3">
								<div className="flex flex-wrap items-center gap-2">
									<Badge tone={stateTone}>{stateLabel}</Badge>
									{mine.link && (
										<a href={mine.link} target="_blank" rel="noreferrer" className="mono flex items-center gap-1 text-xs text-cyan" dir="ltr">
											<ExternalLink className="h-3.5 w-3.5" /> {mine.link}
										</a>
									)}
									{mine.link && <CopyBtn value={mine.link} />}
								</div>
								<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
									<span className="mono" dir="ltr">{mine.tokenMasked}</span>
									{mine.activatedAt && <span className="num">{t("created_at")}: {formatDate(mine.activatedAt, locale)}</span>}
									{mine.paid > 0 && <span className="num">{L("پرداخت‌شده", "Paid") + ": " + money(mine.paid) + " " + L("تومان", "IRT")}</span>}
								</div>
								<div className="flex flex-wrap gap-2">
									{mine.enabled ? (
										<Button size="sm" loading={busy} onClick={() => act({ enabled: false }, L("ربات متوقف شد", "Bot paused"))}>
											<Pause className="h-4 w-4" /> {L("توقف", "Pause")}
										</Button>
									) : (
										<Button size="sm" variant="primary" loading={busy} disabled={mine.blocked} onClick={() => act({ enabled: true }, L("ربات روشن شد", "Bot resumed"))}>
											<Play className="h-4 w-4" /> {L("شروع", "Resume")}
										</Button>
									)}
									<Button size="sm" variant="ghost" loading={busy} onClick={removeMine}>
										<Trash2 className="h-4 w-4 text-danger" /> {t("delete")}
									</Button>
								</div>
							</div>
						)}
					</div>
				</Card>

				<Card title={L("راهنما و دستورها", "Guide & commands")} subtitle={L("مشتری با این دستورها از ربات خرید می‌کند", "What customers send to the bot")}>
					<ol className="mb-4 space-y-2 text-xs leading-6 text-muted">
						<li>{L("۱) در @BotFather ربات بسازید و توکن را کپی کنید.", "1) Create a bot in @BotFather and copy the token.")}</li>
						<li>{L("۲) توکن را در همین صفحه ثبت کنید؛ ربات تا چند ثانیه روشن می‌شود.", "2) Save the token here; the bot starts within seconds.")}</li>
						<li>{L("۳) فروشگاه خود را فعال کنید تا لینک خرید ساخته شود.", "3) Enable your storefront so the buy link can be built.")}</li>
						<li>{L("۴) شناسه تلگرام خود را در حساب ادمین ثبت کنید تا /stats کار کند.", "4) Set your Telegram ID on your admin account to use /stats.")}</li>
					</ol>
					<div className="flex flex-wrap gap-2">
						{COMMANDS.map((c) => (
							<span key={c} className="chip mono" dir="ltr">{c}</span>
						))}
					</div>
					<div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
						<a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="chip mono" dir="ltr">@BotFather</a>
						<span>{L("پاسخ ربات لحظه‌ای نیست و تا چند ثانیه زمان می‌برد.", "Replies can take a few seconds.")}</span>
					</div>
				</Card>
			</div>

			{owner && (
				<form onSubmit={saveConfig}>
					<Card
						title={L("تنظیمات مالک", "Owner settings")}
						subtitle={L("اجازهٔ ساخت ربات فروش برای نمایندگان و قیمت آن", "Allow reseller sales bots and price them")}
						actions={<Button type="submit" variant="primary" loading={saving}>{t("save")}</Button>}
					>
						<div className="grid gap-4 sm:grid-cols-3">
							<div className="tile p-3">
								<Switch checked={cfg.enabled} onChange={(v) => setCfg((c) => ({ ...c, enabled: v }))} label={L("ربات فروش نمایندگان", "Reseller sales bots")} />
								<div className="mt-1 text-xs text-muted">{L("با خاموش بودن، هیچ ربات نماینده‌ای اجرا نمی‌شود.", "While off, no reseller bot runs.")}</div>
							</div>
							<Field label={L("هزینهٔ فعال‌سازی (تومان)", "Activation fee (IRT)")} hint={L("یک‌بار از کیف پول نماینده کم می‌شود؛ صفر = رایگان", "Charged once from the reseller wallet; 0 = free")}>
								<Input
									type="number"
									min={0}
									dir="ltr"
									className="num"
									value={cfg.setupPrice}
									onChange={(e) => setCfg((c) => ({ ...c, setupPrice: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
								/>
							</Field>
							<Field label={L("پیام خوش‌آمد مشترک", "Shared welcome line")} hint={L("به /start همهٔ ربات‌ها اضافه می‌شود", "Appended to every /start")}>
								<Input value={cfg.welcome} onChange={(e) => setCfg((c) => ({ ...c, welcome: e.target.value.slice(0, 600) }))} />
							</Field>
						</div>
					</Card>
				</form>
			)}

			{owner && (
				<Card
					title={L("ربات‌های ثبت‌شده", "Registered bots")}
					subtitle={L("هر نماینده حداکثر یک ربات فروش دارد", "One sales bot per reseller")}
					actions={
						<Button size="sm" onClick={refresh} loading={busy} title={t("refresh")}>
							<RefreshCw className="h-4 w-4" />
						</Button>
					}
				>
					{data.bots.length === 0 ? (
						<Empty text={L("هنوز هیچ نماینده‌ای ربات فروش نساخته است.", "No reseller has created a sales bot yet.")} />
					) : (
						<div className="space-y-3">
							{data.bots.map((b) => (
								<div key={b.adminId} className="tile flex flex-wrap items-center justify-between gap-3 p-3">
									<div className="min-w-0 space-y-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="truncate text-sm font-medium text-fg">{b.adminName}</span>
											<Badge tone={rowTone(b)}>{rowLabel(b)}</Badge>
											{!b.adminActive && <Badge tone="muted">{t("inactive")}</Badge>}
											{b.link && (
												<a href={b.link} target="_blank" rel="noreferrer" className="mono text-xs text-cyan" dir="ltr">@{b.username}</a>
											)}
										</div>
										<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
											<span className="mono" dir="ltr">{b.tokenMasked}</span>
											{b.activatedAt && <span className="num">{formatDate(b.activatedAt, locale)}</span>}
											{b.paid > 0 && <span className="num">{money(b.paid) + " " + L("تومان", "IRT")}</span>}
										</div>
									</div>
									<div className="flex flex-wrap items-center gap-1">
										<Button
											size="sm"
											variant="ghost"
											loading={busy}
											title={b.blocked ? L("باز کردن", "Unlock") : L("قفل کردن", "Lock")}
											onClick={() => act({ adminId: b.adminId, blocked: !b.blocked }, b.blocked ? L("قفل باز شد", "Unlocked") : L("ربات قفل شد", "Locked"))}
										>
											{b.blocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
										</Button>
										<Button size="icon" variant="ghost" loading={busy} title={t("delete")} onClick={() => removeBot(b)}>
											<Trash2 className="h-4 w-4 text-danger" />
										</Button>
									</div>
								</div>
							))}
						</div>
					)}
				</Card>
			)}
		</div>
	)
}
