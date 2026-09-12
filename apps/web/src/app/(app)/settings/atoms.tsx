"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { copyText } from "@/lib/client"
import { Button, cx } from "@/components/ui"

export type IconType = typeof Copy

/** Inline gradients would need a style object; set them on the node instead. */
export function Gradient({ from, to, className, children }: { from: string; to: string; className?: string; children?: ReactNode }) {
	const ref = useRef<HTMLDivElement | null>(null)
	useEffect(() => {
		ref.current?.style.setProperty("background", `linear-gradient(135deg, ${from}, ${to})`)
	}, [from, to])
	return (
		<div ref={ref} className={className}>
			{children}
		</div>
	)
}

export function Swatch({ color, className }: { color: string; className?: string }) {
	const ref = useRef<HTMLSpanElement | null>(null)
	useEffect(() => {
		ref.current?.style.setProperty("background", color)
	}, [color])
	return <span ref={ref} className={cx("inline-block h-4 w-4 shrink-0 rounded-md border border-line", className)} />
}

export function CopyBtn({ value, label }: { value: string; label: string }) {
	const [done, setDone] = useState(false)
	return (
		<Button
			size="icon"
			variant="ghost"
			type="button"
			title={label}
			onClick={async () => {
				await copyText(value)
				setDone(true)
				window.setTimeout(() => setDone(false), 1200)
			}}
		>
			{done ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
		</Button>
	)
}

export function Choice({ active, onClick, icon: Icon, title, hint }: { active: boolean; onClick: () => void; icon: IconType; title: string; hint?: string }) {
	return (
		<button type="button" onClick={onClick} className={cx("glass flex flex-1 items-center gap-3 p-3 text-start transition hover:-translate-y-0.5", active ? "border border-violet/50 text-fg neon-ring" : "text-muted")}>
			<span className={cx("flex h-9 w-9 items-center justify-center rounded-xl", active ? "bg-gradient-to-br from-violet to-cyan text-white" : "bg-surface-2")}>
				<Icon className="h-4 w-4" />
			</span>
			<span className="min-w-0">
				<span className="block truncate text-sm font-medium">{title}</span>
				{hint ? <span className="block truncate text-[11px] text-muted">{hint}</span> : null}
			</span>
		</button>
	)
}
