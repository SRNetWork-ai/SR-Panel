import { AlertTriangle, LifeBuoy, RefreshCw, Send } from "lucide-react"

type Props = {
	renewUrl: string | null
	supportUrl: string | null
	telegramUrl: string | null
	brandName: string
	daysLeft: number | null
	usedPct: number
	expired: boolean
}

const STEPS: Array<{ t: string; d: string }> = [
	{ t: "۱. برنامه را نصب کنید", d: "برای اندروید v2rayNG یا Hiddify و برای آیفون Streisand یا Shadowrocket پیشنهاد می‌شود." },
	{ t: "۲. لینک اشتراک را افزوده کنید", d: "دکمهٔ «افزودن» همان برنامه را بزنید؛ یا لینک را کپی کرده و در بخش Subscription برنامه بچسبانید." },
	{ t: "۳. به‌روزرسانی و اتصال", d: "یک‌بار Update را بزنید تا سرورها بیایند، سپس کمترین پینگ را انتخاب و وصل شوید." },
	{ t: "۴. در صورت قطعی چه کنیم؟", d: "اول Update اشتراک، بعد تغییر سرور؛ اگر باز هم وصل نشد، به پشتیبانی پیام دهید." },
]

const FAQ: Array<{ q: string; a: string }> = [
	{ q: "لینک اشتراک را روی چند دستگاه می‌توانم باشد؟", a: "بله، همین یک لینک روی همهٔ دستگاه‌ها کار می‌کند؛ فقط محدودیت تعداد اتصال هم‌زمان را رعایت کنید." },
	{ q: "حجم مصرفی هر چند وقت به‌روز می‌شود؟", a: "معمولاً هر چند دقیقه یک‌بار؛ اگر عدد عقب بود کمی صبر کنید و صفحه را دوباره باز کنید." },
	{ q: "لینک من لو رفته، چه کنم؟", a: "از پشتیبانی بخواهید لینک اشتراک را بازنشانی کند؛ لینک قبلی فوراً از کار می‌افتد." },
	{ q: "تمدید چطور انجام می‌شود؟", a: "اگر دکمهٔ تمدید را می‌بینید، مستقیم از همین صفحه می‌توانید پلن را تمدید کنید؛ لینک اشتراک تغییر نمی‌کند." },
]

/** Setup guide, FAQ and the renew call-to-action. */
export function SubHelp({ renewUrl, supportUrl, telegramUrl, brandName, daysLeft, usedPct, expired }: Props) {
	const lowDays = daysLeft !== null && daysLeft <= 3
	const lowTraffic = usedPct >= 85
	const warn = expired || lowDays || lowTraffic
	const warnText = expired
		? "اشتراک شما دیگر فعال نیست."
		: lowDays
			? "کمتر از چند روز از اشتراک شما باقی مانده است."
			: "بیش از ۸۵٪ حجم اشتراک مصرف شده است."

	return (
		<>
			{renewUrl && warn ? (
				<section className="glass fade-up flex flex-wrap items-center justify-between gap-3 p-5">
					<div className="flex min-w-0 items-start gap-2">
						<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
						<div className="min-w-0">
							<div className="text-sm font-semibold">زمان تمدید است</div>
							<div className="text-[11px] text-muted">{warnText}</div>
						</div>
					</div>
					<a className="btn btn-primary" href={renewUrl}>
						<RefreshCw className="h-4 w-4" /> تمدید اشتراک
					</a>
				</section>
			) : null}

			<section className="glass fade-up space-y-3 p-5">
				<div className="text-sm font-semibold">راهنمای اتصال</div>
				<ol className="space-y-2">
					{STEPS.map((s) => (
						<li key={s.t} className="glass glass-2 p-3">
							<div className="text-[13px] font-medium">{s.t}</div>
							<div className="pt-0.5 text-[11px] leading-5 text-muted">{s.d}</div>
						</li>
					))}
				</ol>
			</section>

			<section className="glass fade-up space-y-2 p-5">
				<div className="text-sm font-semibold">سوالات متداول</div>
				{FAQ.map((f) => (
					<details key={f.q} className="glass glass-2 p-3">
						<summary className="cursor-pointer text-[13px] font-medium">{f.q}</summary>
						<p className="pt-2 text-[11px] leading-5 text-muted">{f.a}</p>
					</details>
				))}
			</section>

			<div className="fade-up flex flex-wrap items-center justify-center gap-2">
				{renewUrl && !warn ? (
					<a className="btn" href={renewUrl}>
						<RefreshCw className="h-4 w-4" /> تمدید / خرید پلن
					</a>
				) : null}
				{telegramUrl ? (
					<a className="btn" href={telegramUrl} target="_blank" rel="noreferrer">
						<Send className="h-4 w-4" /> تلگرام {brandName}
					</a>
				) : null}
				{supportUrl ? (
					<a className="btn" href={supportUrl} target="_blank" rel="noreferrer">
						<LifeBuoy className="h-4 w-4" /> پشتیبانی
					</a>
				) : null}
			</div>
		</>
	)
}
