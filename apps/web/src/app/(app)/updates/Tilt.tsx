"use client"

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"

/** Pointer-reactive 3D tilt wrapper (see app/motion3d.css). */
export function Tilt({ children, max = 7 }: { children: ReactNode; max?: number }) {
	const ref = useRef<HTMLDivElement | null>(null)

	const move = (e: ReactPointerEvent<HTMLDivElement>) => {
		const el = ref.current
		if (!el) return
		const r = el.getBoundingClientRect()
		const px = (e.clientX - r.left) / r.width
		const py = (e.clientY - r.top) / r.height
		el.style.setProperty("--ry", `${(px - 0.5) * max * 2}deg`)
		el.style.setProperty("--rx", `${(0.5 - py) * max * 2}deg`)
		el.style.setProperty("--mx", `${px * 100}%`)
		el.style.setProperty("--my", `${py * 100}%`)
	}

	const reset = () => {
		const el = ref.current
		if (!el) return
		el.style.setProperty("--ry", "0deg")
		el.style.setProperty("--rx", "0deg")
	}

	return (
		<div ref={ref} className="tilt h-full" onPointerMove={move} onPointerLeave={reset}>
			{children}
		</div>
	)
}
