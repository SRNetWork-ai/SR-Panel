"use client"

import { useCallback, useEffect, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Card, cx } from "@/components/ui"

export type TabItem<T extends string = string> = {
	id: T
	label: ReactNode
	icon?: ComponentType<{ className?: string }>
	badge?: ReactNode
	hint?: string
}

/** slack (px) before an edge counts as "there is more to scroll" */
const EDGE = 2

/**
 * Segmented, scrollable tab bar with a 3D active pill. Shared by store / settings / integrations.
 * Scrolls with the wheel, with a mouse drag, with the edge arrows and with the keyboard, and keeps
 * the selected tab in view. The item class is `srp-tab`; the mobile bottom bar uses `srp-navtab`,
 * so the mobile-only rules in mobile.css can no longer hide these tabs on desktop.
 */
export function Tabs<T extends string>({ items, value, onChange, className }: { items: Array<TabItem<T>>; value: T; onChange: (id: T) => void; className?: string }) {
	const box = useRef<HTMLDivElement | null>(null)
	const drag = useRef<{ id: number; x: number; left: number; moved: boolean } | null>(null)
	const swallowClick = useRef(false)
	const [more, setMore] = useState({ start: false, end: false })

	const measure = useCallback(() => {
		const el = box.current
		if (!el) return
		const max = el.scrollWidth - el.clientWidth
		// RTL viewports report a negative offset, so compare distances instead of raw values
		const at = Math.abs(el.scrollLeft)
		const next = max <= EDGE ? { start: false, end: false } : { start: at > EDGE, end: at < max - EDGE }
		setMore((p) => (p.start === next.start && p.end === next.end ? p : next))
	}, [])

	useEffect(() => {
		const el = box.current
		if (!el) return
		measure()
		const onWheel = (e: WheelEvent) => {
			if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
			if (el.scrollWidth - el.clientWidth <= EDGE) return
			e.preventDefault()
			el.scrollLeft += getComputedStyle(el).direction === "rtl" ? -e.deltaY : e.deltaY
		}
		el.addEventListener("wheel", onWheel, { passive: false })
		el.addEventListener("scroll", measure, { passive: true })
		const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
		ro?.observe(el)
		window.addEventListener("resize", measure)
		return () => {
			el.removeEventListener("wheel", onWheel)
			el.removeEventListener("scroll", measure)
			ro?.disconnect()
			window.removeEventListener("resize", measure)
		}
	}, [measure, items.length])

	// keep the selected tab visible (physical pixels work in both directions)
	useEffect(() => {
		const el = box.current
		const active = el?.querySelector<HTMLElement>("[data-active='1']")
		if (!el || !active) return
		const pad = 14
		const a = active.getBoundingClientRect()
		const b = el.getBoundingClientRect()
		if (a.left < b.left + pad) el.scrollBy({ left: a.left - b.left - pad, behavior: "smooth" })
		else if (a.right > b.right - pad) el.scrollBy({ left: a.right - b.right + pad, behavior: "smooth" })
	}, [value])

	const nudge = (toEnd: boolean) => {
		const el = box.current
		if (!el) return
		const step = Math.max(140, el.clientWidth * 0.6)
		const sign = getComputedStyle(el).direction === "rtl" ? -1 : 1
		el.scrollBy({ left: (toEnd ? step : -step) * sign, behavior: "smooth" })
	}

	const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		const el = box.current
		if (!el || e.pointerType !== "mouse" || e.button !== 0) return
		if (el.scrollWidth - el.clientWidth <= EDGE) return
		drag.current = { id: e.pointerId, x: e.clientX, left: el.scrollLeft, moved: false }
	}
	const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		const d = drag.current
		const el = box.current
		if (!d || !el || d.id !== e.pointerId) return
		const dx = e.clientX - d.x
		if (!d.moved && Math.abs(dx) < 4) return
		d.moved = true
		el.scrollLeft = d.left - dx
	}
	// a drag that ends on a tab must not switch tabs
	const endDrag = () => {
		const d = drag.current
		drag.current = null
		if (!d?.moved) return
		swallowClick.current = true
		window.setTimeout(() => {
			swallowClick.current = false
		}, 0)
	}
	const pick = (id: T) => {
		if (swallowClick.current) return
		onChange(id)
	}

	const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
		if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return
		const idx = items.findIndex((x) => x.id === value)
		if (idx < 0) return
		const rtl = box.current ? getComputedStyle(box.current).direction === "rtl" : false
		const forward = e.key === "ArrowRight" ? !rtl : rtl
		const at = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : forward ? idx + 1 : idx - 1
		const target = items[at]
		if (!target || target.id === value) return
		e.preventDefault()
		onChange(target.id)
	}

	return (
		<div className={cx("srp-tabs-wrap", className)}>
			<div
				ref={box}
				className="srp-tabs sheen"
				role="tablist"
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
				onPointerLeave={endDrag}
				onKeyDown={onKeyDown}
			>
				{items.map((it) => {
					const Icon = it.icon
					const active = it.id === value
					return (
						<button
							key={it.id}
							type="button"
							role="tab"
							aria-selected={active}
							tabIndex={active ? 0 : -1}
							data-active={active ? "1" : "0"}
							title={it.hint}
							onClick={() => pick(it.id)}
							className={cx("srp-tab", active && "active")}
						>
							{Icon ? <Icon className="h-4 w-4" /> : null}
							<span>{it.label}</span>
							{it.badge === undefined || it.badge === null ? null : <span className="srp-tab-badge">{it.badge}</span>}
						</button>
					)
				})}
			</div>
			{more.start && (
				<button type="button" tabIndex={-1} aria-hidden className="srp-tabs-nav start" onClick={() => nudge(false)}>
					<ChevronLeft className="h-4 w-4" />
				</button>
			)}
			{more.end && (
				<button type="button" tabIndex={-1} aria-hidden className="srp-tabs-nav end" onClick={() => nudge(true)}>
					<ChevronRight className="h-4 w-4" />
				</button>
			)}
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
