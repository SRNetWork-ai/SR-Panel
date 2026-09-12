"use client"

import { useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { copyText } from "@/lib/client"
import { Button } from "@/components/ui"

export function CopyBtn({ value, label }: { value: string; label?: string }) {
	const [ok, setOk] = useState(false)
	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
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

export function MiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
	return (
		<div className="tile flex items-center gap-3">
			<span className="text-violet-soft">{icon}</span>
			<div className="min-w-0">
				<div className="text-[11px] text-muted">{label}</div>
				<div className="num truncate text-sm font-semibold">{value}</div>
			</div>
		</div>
	)
}
