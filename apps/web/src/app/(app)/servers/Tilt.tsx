"use client"

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"

/** Pointer-driven 3D tilt - writes the CSS vars that .tilt consumes (see motion3d.css). */
export function Tilt({ children, max = 7 }: { children: ReactNode; max?: number }) {
	const ref = useRef<HTMLDivElement>(null)
	const move = (e: ReactPointerEvent<HTMLDivElement>) => {
		const el = ref.current
		if (!el || e.pointerType === "touch") return
		const r = el.getBoundingClientRect()
		const px = (e.clientX - r.left) / r.width - 0.5
		const py = (e.clientY - r.top) / r.height - 0.5
		el.style.setProperty("--ry", (px * max).toFixed(2) + "deg")
		el.style.setProperty("--rx", (-py * max).toFixed(2) + "deg")
		el.style.setProperty("--mx", (px * 100 + 50).toFixed(1) + "%")
		el.style.setProperty("--my", (py * 100 + 50).toFixed(1) + "%")
	}
	const reset = () => {
		const el = ref.current
		if (!el) return
		el.style.setProperty("--rx", "0deg")
		el.style.setProperty("--ry", "0deg")
	}
	return (
		<div ref={ref} className="tilt" onPointerMove={move} onPointerLeave={reset}>
			{children}
		</div>
	)
}
