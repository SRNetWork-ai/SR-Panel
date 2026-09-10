import { cx } from "@/lib/cx"

export function Logo({ name = "SRPanel", compact, className }: { name?: string; compact?: boolean; className?: string }) {
	return (
		<div className={cx("flex items-center gap-2.5", className)}>
			<span className="neon-ring relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-violet to-cyan text-white">
				<svg viewBox="0 0 64 64" className="h-6 w-6" fill="none" aria-hidden>
					<path d="M23 40c1.5 3 5 4.5 9 4.5 5.5 0 9-2.6 9-6.6 0-8.2-17-4.3-17-13.4 0-4 3.6-6.5 8.6-6.5 3.9 0 7 1.4 8.8 3.9" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
					<circle cx="47" cy="17" r="4.5" fill="currentColor" />
				</svg>
			</span>
			{!compact && (
				<span className="leading-tight">
					<span className="block text-base font-bold tracking-tight">
						<span className="neon-text">{name}</span>
					</span>
					<span className="block text-[10px] text-muted">v1.0 • alpha</span>
				</span>
			)}
		</div>
	)
}
