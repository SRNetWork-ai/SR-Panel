"use client"

import Link from "next/link"
import { Activity, ArrowDownToLine, Clock, DatabaseBackup, ExternalLink, Globe2, Plug, Server, Settings2, Store, Tag } from "lucide-react"
import type { AdminDto } from "@/lib/dto"
import { useLocale, useT } from "@/lib/i18n"
import { MiniStat } from "@/components/bits"
import { Row, Section } from "@/components/parts"
import { CopyBtn } from "./atoms"
import { fmtWhen, tr, type SystemInfo } from "./types"

type LinkItem = { href: string; label: string; hint: string; icon: typeof Store; owner?: boolean }

export function SystemTab({ me, info }: { me: AdminDto; info: SystemInfo }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const isOwner = me.role === "OWNER"

	const links: LinkItem[] = [
		{ href: "/updates", label: L("به‌روزرسانی پنل", "Panel updates"), hint: L("بررسی نسخه و نصب به‌روزرسانی", "Check and install updates"), icon: ArrowDownToLine, owner: true },
		{ href: "/backups", label: L("بکاپ‌ها", "Backups"), hint: L("نسخه پشتیبان دستی و زمان‌بندی‌شده", "Manual and scheduled copies"), icon: DatabaseBackup, owner: true },
		{ href: "/monitoring", label: L("مانیتورینگ", "Monitoring"), hint: L("سلامت سرورها و منابع", "Server health and resources"), icon: Activity, owner: true },
		{ href: "/integrations", label: L("یکپارچه‌سازی‌ها", "Integrations"), hint: L("تلگرام، کلید API و وب‌هوک", "Telegram, API keys, webhooks"), icon: Plug },
		{ href: "/store", label: L("فروشگاه", "Store"), hint: L("پلن‌ها و قیمت‌گذاری", "Plans and pricing"), icon: Store },
		{ href: "/servers", label: L("سرورها", "Servers"), hint: L("پنل‌های x-ui متصل", "Connected x-ui panels"), icon: Server },
	].filter((l) => !l.owner || isOwner)

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<MiniStat icon={<Tag className="h-4 w-4" />} label={L("نسخه پنل", "Panel version")} value={info.version} tone="violet" />
				<MiniStat icon={<Globe2 className="h-4 w-4" />} label={L("آدرس عمومی", "Public URL")} value={info.publicUrl ? L("تنطیم شده", "Configured") : L("تنطیم نشده", "Not set")} tone={info.publicUrl ? "success" : "warning"} />
				<MiniStat icon={<Clock className="h-4 w-4" />} label={L("منطقه زمانی سرور", "Server timezone")} value={info.tz} tone="cyan" />
				<MiniStat icon={<Server className="h-4 w-4" />} label={L("دسترسی شما", "Your access")} value={isOwner ? t("owner") : t("admin")} />
			</div>

			<div className="grid gap-4 xl:grid-cols-2">
				<Section icon={Server} title={L("اطلاعات پنل", "Panel info")} subtitle={L("نسخه و آدرس سرویس", "Version and service address")} actions={info.publicUrl ? <CopyBtn value={info.publicUrl} label={L("کپی آدرس", "Copy URL")} /> : undefined}>
					<Row label={L("نسخه پنل", "Panel version")} mono>{info.version}</Row>
					<Row label={L("آدرس عمومی", "Public URL")} mono>{info.publicUrl || "—"}</Row>
					<Row
						label={
							<span className="flex items-center gap-1">
								<Clock className="h-3.5 w-3.5" />
								{L("منطقه زمانی سرور", "Server timezone")}
							</span>
						}
						mono
					>
						{info.tz}
					</Row>
					<Row label={L("حساب فعلی", "Signed in as")} mono>{me.username}</Row>
					<Row label={L("آخرین ورود", "Last login")} mono>{fmtWhen(me.lastLoginAt, locale)}</Row>
					<Row label={t("created_at")} mono>{fmtWhen(me.createdAt, locale)}</Row>
					{info.publicUrl ? (
						<div className="mt-3">
							<a href={info.publicUrl} target="_blank" rel="noreferrer" className="btn btn-sm">
								<ExternalLink className="h-4 w-4" />
								{L("باز کردن آدرس عمومی", "Open public URL")}
							</a>
						</div>
					) : (
						<p className="mt-3 text-[11px] text-warning">{L("متغیر SRP_PUBLIC_URL تنطیم نشده؛ لینک اشتراک مشتریان ممکن است ناقص ساخته شود.", "SRP_PUBLIC_URL is not set; customer subscription links may be incomplete.")}</p>
					)}
				</Section>

				<Section icon={Settings2} title={L("میان‌برها", "Quick links")} subtitle={L("بخش‌هایی که از تنطیمات بیشتر سر می‌زنید", "Pages you reach for from settings")}>
					<div className="grid gap-2 sm:grid-cols-2">
						{links.map((l) => (
							<Link key={l.href} href={l.href} className="glass-2 flex items-center gap-3 p-3 text-sm transition hover:-translate-y-0.5">
								<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet/30 to-cyan/20 text-violet-soft">
									<l.icon className="h-4 w-4" />
								</span>
								<span className="min-w-0">
									<span className="block truncate">{l.label}</span>
									<span className="block truncate text-[11px] text-muted">{l.hint}</span>
								</span>
							</Link>
						))}
					</div>
					{info.agentHint ? <p className="mt-3 text-[11px] text-muted">{L("به‌روزرسانی پنل از صفحه به‌روزرسانی انجام می‌شود؛ نیازی به ورود به سرور نیست.", "Panel updates run from the Updates page; no server login needed.")}</p> : null}
				</Section>
			</div>
		</div>
	)
}
