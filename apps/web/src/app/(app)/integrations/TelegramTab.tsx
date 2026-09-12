"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import { AlertTriangle, Bot, CheckCircle2, Eye, EyeOff, Hash, KeyRound, Send, Terminal, Users } from "lucide-react"
import { api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Card, Field, Input, Switch, cx, useToast } from "@/components/ui"
import { CopyBtn, MiniStat } from "@/components/bits"
import { errMsg, tr, type TelegramForm } from "./types"

type TestResult = { ok: boolean; error?: string; bot?: { username?: string }; sent?: { ok: boolean; error?: string } }

const COMMANDS = ["/status", "/clients", "/client <name>", "/expiring", "/incidents", "/backup", "/id"]

export function TelegramTab({ initial }: { initial: TelegramForm }) {
	const t = useT()
	const locale = useLocale()
	const toast = useToast()
	const L = (fa: string, en: string) => tr(locale, fa, en)

	const [form, setForm] = useState<TelegramForm>(initial)
	const [saving, setSaving] = useState(false)
	const [testing, setTesting] = useState(false)
	const [reveal, setReveal] = useState(false)
	const [res, setRes] = useState<TestResult | null>(null)

	const set = <K extends keyof TelegramForm>(k: K, v: TelegramForm[K]) => setForm((f) => ({ ...f, [k]: v }))

	async function save(e: FormEvent) {
		e.preventDefault()
		setSaving(true)
		try {
			const { botTokenMasked: _m, hasToken: _h, ...body } = form
			const r = await api<TelegramForm>("/api/settings/telegram", { method: "PUT", json: body })
			setForm(r)
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setSaving(false)
		}
	}

	async function test() {
		setTesting(true)
		setRes(null)
		try {
			const r = await api<TestResult>("/api/settings/telegram/test", {
				method: "POST",
				json: { botToken: form.botToken || undefined, chatId: form.chatId || undefined },
			})
			setRes(r)
			if (!r.ok) toast.err(`${t("tg_test_fail")}: ${r.error ?? ""}`)
			else if (r.sent?.ok) toast.ok(t("tg_test_ok"))
			else toast.err(`${t("tg_bot_ok_no_msg")}: ${r.sent?.error ?? ""}`)
		} catch (err) {
			toast.err(errMsg(err, t("error_generic")))
		} finally {
			setTesting(false)
		}
	}

	const groups: Array<{ title: string; hint: string; icon: ReactNode; items: Array<{ k: keyof TelegramForm; label: string; hint: string }> }> = [
		{
			title: L("عملیات و سرورها", "Operations"),
			hint: L("سلامت پنل و سرورها", "Panel & server health"),
			icon: <AlertTriangle className="h-4 w-4" />,
			items: [
				{ k: "notifyIncidents", label: t("tg_notify_incidents"), hint: L("قطعی سرور، خطای اتصال و مصرف بالای منابع", "Outages, connection errors, resource spikes") },
				{ k: "notifyBackups", label: t("tg_notify_backups"), hint: L("نتیجهٔ هر پشتیبان‌گیری خودکار", "Result of each scheduled backup") },
				{ k: "notifyLogins", label: t("tg_notify_logins"), hint: L("ورود ادمین‌ها و تلاش‌های ناموفق", "Admin logins and failed attempts") },
			],
		},
		{
			title: L("مشتریان", "Clients"),
			hint: L("یادآوری انقضا و مصرف حجم", "Expiry & traffic reminders"),
			icon: <Users className="h-4 w-4" />,
			items: [
				{ k: "notifyExpiry", label: t("tg_notify_expiry"), hint: L("نزدیک‌شدن تاریخ انقضای سرویس‌ها", "Services approaching expiry") },
				{ k: "notifyTraffic", label: t("tg_notify_traffic"), hint: L("عبور از درصدهای تعیین‌شدهٔ مصرف", "Crossing configured usage thresholds") },
				{ k: "notifyClientsDirect", label: t("tg_notify_clients_direct"), hint: L("پیام مستقیم به مشتری دارای آیدی تلگرام", "Direct message to clients with a Telegram ID") },
			],
		},
	]

	return (
		<form onSubmit={save} className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<MiniStat icon={<Bot className="h-4 w-4" />} label={L("وضعیت اتصال", "Connection")} value={form.enabled ? L("فعال", "Enabled") : L("خاموش", "Disabled")} tone={form.enabled ? "success" : "warning"} />
				<MiniStat icon={<KeyRound className="h-4 w-4" />} label={t("tg_token")} value={form.hasToken ? L("ذخیره شده", "Saved") : L("تنظیم نشده", "Not set")} tone={form.hasToken ? "violet" : "danger"} />
				<MiniStat icon={<Hash className="h-4 w-4" />} label={t("tg_chat_id")} value={<span className="mono text-sm" dir="ltr">{form.chatId || "—"}</span>} tone="cyan" />
				<MiniStat icon={<Terminal className="h-4 w-4" />} label={t("tg_bot_enabled")} value={form.botEnabled ? L("روشن", "On") : L("خاموش", "Off")} tone={form.botEnabled ? "success" : undefined} />
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				<Card title={t("tg_title")} subtitle={t("tg_sub")}>
					<div className="space-y-4">
						<div className="tile p-3">
							<Switch checked={form.enabled} onChange={(v) => set("enabled", v)} label={t("tg_enabled")} />
							<div className="mt-1 text-xs text-muted">{L("با خاموش بودن این گزینه هیچ پیامی ارسال نمی‌شود.", "Nothing is sent while this is off.")}</div>
						</div>
						<Field label={t("tg_token")} hint={form.hasToken ? `${t("tg_token_saved")}: ${form.botTokenMasked}` : t("tg_token_hint")}>
							<div className="flex items-center gap-2">
								<Input
									type={reveal ? "text" : "password"}
									dir="ltr"
									autoComplete="off"
									className="mono flex-1"
									placeholder={form.hasToken ? L("بدون تغییر", "unchanged") : "123456789:AA..."}
									value={form.botToken}
									onChange={(e) => set("botToken", e.target.value)}
								/>
								<Button type="button" variant="ghost" size="icon" title={L("نمایش", "Reveal")} onClick={() => setReveal((v) => !v)}>
									{reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
								</Button>
							</div>
						</Field>
						<Field label={t("tg_chat_id")} hint={t("tg_chat_hint")}>
							<Input dir="ltr" className="mono" placeholder="-1001234567890" value={form.chatId} onChange={(e) => set("chatId", e.target.value)} />
						</Field>
						<div className="tile p-3">
							<Switch checked={form.botEnabled} onChange={(v) => set("botEnabled", v)} label={t("tg_bot_enabled")} />
							<div className="mt-1 text-xs text-muted">{L("پاسخ‌دهی ربات به دستورهای متنی ادمین‌ها", "Lets the bot answer admin commands")}</div>
						</div>
						{res && (
							<div className={cx("glass-2 rounded-xl p-3 text-xs leading-6", res.ok ? "border border-violet/40" : "border border-white/10")}>
								<div className="flex flex-wrap items-center gap-2">
									{res.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4 text-danger" />}
									<span className="font-medium text-fg">{res.ok ? L("ربات پاسخ داد", "Bot reachable") : L("اتصال ناموفق", "Connection failed")}</span>
									{res.bot?.username && <Badge tone="success">@{res.bot.username}</Badge>}
								</div>
								{res.error && <div className="mt-1 text-danger">{res.error}</div>}
								{res.ok && (
									<div className="mt-1 text-muted">
										{res.sent?.ok ? L("پیام آزمایشی به چت ارسال شد.", "Test message delivered.") : `${L("ارسال پیام ناموفق", "Message failed")}: ${res.sent?.error ?? ""}`}
									</div>
								)}
							</div>
						)}
					</div>
				</Card>

				<Card title={t("tg_notifications")} subtitle={t("tg_notifications_sub")}>
					<div className="space-y-5">
						{groups.map((g) => (
							<div key={g.title}>
								<div className="mb-2 flex flex-wrap items-center gap-2">
									{g.icon}
									<span className="text-sm font-medium text-fg">{g.title}</span>
									<span className="text-xs text-muted">{g.hint}</span>
								</div>
								<div className="space-y-2">
									{g.items.map((it) => (
										<div key={String(it.k)} className="tile p-3">
											<Switch checked={Boolean(form[it.k])} onChange={(v) => set(it.k, v as never)} label={it.label} />
											<div className="mt-1 text-xs text-muted">{it.hint}</div>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				</Card>
			</div>

			<Card title={t("tg_commands")} subtitle={t("tg_commands_hint")}>
				<div className="flex flex-wrap gap-2">
					{COMMANDS.map((c) => (
						<span key={c} className="chip mono" dir="ltr">{c}</span>
					))}
				</div>
				<div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
					<CopyBtn value={COMMANDS.join("\n")} label={L("کپی فهرست", "Copy list")} />
					<span>{L("برای دریافت chat id، دستور /id را به ربات بفرستید.", "Send /id to the bot to get your chat id.")}</span>
				</div>
			</Card>

			<div className="glass sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3">
				<div className="text-xs text-muted">{L("تغییرها تا زمان ذخیره اعمال نمی‌شوند.", "Changes apply after saving.")}</div>
				<div className="flex flex-wrap gap-2">
					<Button type="button" onClick={test} loading={testing}>
						<Send className="h-4 w-4" /> {t("tg_test")}
					</Button>
					<Button type="submit" variant="primary" loading={saving}>{t("save")}</Button>
				</div>
			</div>
		</form>
	)
}
