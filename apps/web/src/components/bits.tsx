"use client"

import { useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { copyText } from "@/lib/client"
import { Button } from "@/components/ui"

/** copy-to-clipboard button with a short success state */
export function CopyBtn({ value, label, title }: { value: string; label?: string; title?: string }) {
	const [ok, setOk] = useState(false)
	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
			title={title}
			onClick={async () => {
				if (await copyText(value)) {
					setOk(true)
					setTimeout(() => setOk(false), 1400)
				}
			}}
		>
			{ok ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
			{label}
		</Button>
	)
}

/** compact stat tile for toolbars and tab headers */
export function MiniStat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: ReactNode; tone?: "violet" | "cyan" | "success" | "warning" | "danger" }) {
	const colors: Record<string, string> = { violet: "text-violet-soft", cyan: "text-cyan", success: "text-success", warning: "text-warning", danger: "text-danger" }
	return (
		<div className="tile flex items-center gap-3">
			<span className={colors[tone ?? "violet"]}>{icon}</span>
			<div className="min-w-0">
				<div className="text-[11px] text-muted">{label}</div>
				<div className="num truncate text-sm font-semibold">{value}</div>
			</div>
		</div>
	)
}
