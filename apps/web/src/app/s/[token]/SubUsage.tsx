import { formatBytes } from "@/lib/format"

type Point = { date: string; up: number; down: number; total: number }

/** 14-day traffic bars — pure markup, no client JS. */
export function SubUsage({ usage }: { usage: Point[] }) {
	const days = usage.slice(-14)
	if (!days.length) return null
	const max = Math.max(...days.map((d) => d.total), 1)
	const sum = days.reduce((s, d) => s + d.total, 0)
	const up = days.reduce((s, d) => s + d.up, 0)
	const down = days.reduce((s, d) => s + d.down, 0)

	return (
		<section className="glass fade-up space-y-3 p-5">
			<div className="flex items-center justify-between">
				<div className="text-sm font-semibold">مصرف ۱۴ روز گذشته</div>
				<div className="num text-xs text-muted">{formatBytes(sum)}</div>
			</div>
			<div className="flex h-28 items-end justify-between gap-1" dir="ltr">
				{days.map((d) => (
					<div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={d.date + " • " + formatBytes(d.total)}>
						<div
							className="w-full rounded-t-md opacity-90"
							style={{ height: Math.max(4, Math.round((d.total / max) * 100)) + "%", background: "linear-gradient(180deg, var(--brand-accent), var(--brand-primary))" }}
						/>
						<span className="num text-[9px] text-muted">{d.date.slice(8)}</span>
					</div>
				))}
			</div>
			<div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
				<span>
					بیشترین روز: <span className="num">{formatBytes(max)}</span>
				</span>
				<span>
					ارسال / دریافت: <span className="num">{formatBytes(up)}</span> / <span className="num">{formatBytes(down)}</span>
				</span>
			</div>
		</section>
	)
}
