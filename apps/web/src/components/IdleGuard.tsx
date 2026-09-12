"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui"
import { useLocale } from "@/lib/i18n"

/**
 * Signs the operator out after a period without interaction.
 *
 * Activity is shared between tabs through localStorage, so reading a long page in one
 * tab keeps the others alive. A heartbeat refreshes the server-side idle marker at most
 * every 4 minutes, and the last minute is announced instead of dropping the session
 * without warning.
 */
const ACTIVITY_KEY = "srp:last-active"
const WARN_SECONDS = 60
const BEAT_MS = 240_000
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"]

export default function IdleGuard({ minutes }: { minutes: number }) {
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const idleMs = Math.max(2, minutes) * 60_000
	const lastRef = useRef(Date.now())
	const beatRef = useRef(0)
	const goneRef = useRef(false)
	const [left, setLeft] = useState<number | null>(null)

	const stamp = useCallback((at: number) => {
		lastRef.current = at
		try {
			window.localStorage.setItem(ACTIVITY_KEY, String(at))
		} catch {
			/* private mode */
		}
	}, [])

	const beat = useCallback(() => {
		const now = Date.now()
		if (now - beatRef.current < BEAT_MS) return
		beatRef.current = now
		void fetch("/api/auth/session", { method: "POST" }).catch(() => undefined)
	}, [])

	const stay = useCallback(() => {
		stamp(Date.now())
		setLeft(null)
		beatRef.current = 0
		beat()
	}, [beat, stamp])

	const signOut = useCallback(async () => {
		if (goneRef.current) return
		goneRef.current = true
		try {
			await fetch("/api/auth/logout", { method: "POST" })
		} catch {
			/* offline: the cookie is a session cookie anyway */
		}
		window.location.replace("/login?reason=idle")
	}, [])

	useEffect(() => {
		stamp(Date.now())
		const onActivity = () => {
			stamp(Date.now())
			setLeft(null)
			beat()
		}
		const onStorage = (e: StorageEvent) => {
			if (e.key !== ACTIVITY_KEY || !e.newValue) return
			const at = Number(e.newValue)
			if (!Number.isFinite(at)) return
			lastRef.current = Math.max(lastRef.current, at)
			setLeft(null)
		}
		const onVisible = () => {
			if (document.visibilityState === "visible") onActivity()
		}
		for (const type of EVENTS) window.addEventListener(type, onActivity, { passive: true })
		window.addEventListener("storage", onStorage)
		document.addEventListener("visibilitychange", onVisible)
		const timer = window.setInterval(() => {
			const idleFor = Date.now() - lastRef.current
			if (idleFor >= idleMs) {
				void signOut()
				return
			}
			const remain = Math.ceil((idleMs - idleFor) / 1000)
			setLeft(remain <= WARN_SECONDS ? remain : null)
		}, 5_000)
		return () => {
			for (const type of EVENTS) window.removeEventListener(type, onActivity)
			window.removeEventListener("storage", onStorage)
			document.removeEventListener("visibilitychange", onVisible)
			window.clearInterval(timer)
		}
	}, [beat, idleMs, signOut, stamp])

	if (left == null) return null
	return (
		<div className="srp-sheet fixed inset-x-0 bottom-4 z-[140] mx-auto flex w-[min(27rem,92vw)] items-center gap-3 rounded-2xl p-3 text-sm">
			<span className="flex-1">{L(`به‌دلیل بی‌کاری تا ${left} ثانیه دیگر از پنل خارج می‌شوید`, `Signing you out in ${left}s due to inactivity`)}</span>
			<Button type="button" size="sm" variant="primary" onClick={stay}>
				{L("هستم", "Stay")}
			</Button>
		</div>
	)
}
