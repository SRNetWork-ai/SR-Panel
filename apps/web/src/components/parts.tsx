"use client"

import type { ComponentType, ReactNode } from "react"
import { Card, cx } from "@/components/ui"

export type TabItem<T extends string = string> = {
	id: T
	label: ReactNode
	icon?: ComponentType<{ className?: string }>
	badge?: ReactNode
	hint?: string
}

/** Segmented, scrollable tab bar with a 3D active pill. Shared by store / settings / integrations. */
export function Tabs<T extends string>({ items, value, onChange, className }: { items: Array<TabItem<T>>; value: T; onChange: (id: T) => void; className?: string }) {
	return (
		<div className={cx("srp-tabs sheen", className)} role="tablist">
			{items.map((it) => {
				const Icon = it.icon
				const active = it.id === value
				return (
					<button
						key={it.id}
						type="button"
						role="tab"
						aria-selected={active}
						title={it.hint}
						onClick={() => onChange(it.id)}
						className={cx("srp-tab", active && "active")}
					>
						{Icon ? <Icon className="h-4 w-4" /> : null}
						<span>{it.label}</span>
						{it.badge === undefined || it.badge === null ? null : <span className="srp-tab-badge">{it.badge}</span>}
					</button>
				)
			})}
		</div>
	)
}

/* ---------- Section (titled block inside a tab) ---------- */
export function Section({ title, subtitle, icon: Icon, actions, children, className }: { title: ReactNode; subtitle?: ReactNode; icon?: ComponentType<{ className?: string }>; actions?: ReactNode; children: ReactNode; className?: string }) {
	return (
		<Card
			className={cx("tilt", className)}
			title={
				<span className="flex items-center gap-2">
					{Icon ? (
						<span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet/30 to-cyan/20 text-violet-soft">
							<Icon className="h-4 w-4" />
						</span>
					) : null}
					{title}
				</span>
			}
			subtitle={subtitle}
			actions={actions}
		>
			{children}
		</Card>
	)
}

/* ---------- Key/value row ---------- */
export function Row({ label, children, mono }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
	return (
		<div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
			<span className="text-xs text-muted">{label}</span>
			<span className={cx("truncate text-sm", mono && "mono")}>{children}</span>
		</div>
	)
}
