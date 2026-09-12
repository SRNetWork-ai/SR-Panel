"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Copy, Download, ScrollText, Terminal } from "lucide-react"
import { useLocale } from "@/lib/i18n"
import { Button, Card, Input, cx } from "@/components/ui"
import { downloadLog, logLineTone, tr } from "./types"

const MAX_LINES = 2000

export function UpdateConsole({ log, onRefresh, onCopy }: { log: string; onRefresh: () => void; onCopy: (text: string) => void }) {
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)

	const [autoscroll, setAutoscroll] = useState(true)
	const [wrap, setWrap] = useState(true)
	const [onlyErrors, setOnlyErrors] = useState(false)
	const [tall, setTall] = useState(false)
	const [q, setQ] = useState("")
	const boxRef = useRef<HTMLPreElement | null>(null)

	const lines = useMemo(() => {
		const needle = q.trim().toLowerCase()
		const all = (log || "").split("\n")
		const kept = all.filter((ln) => {
			if (onlyErrors && logLineTone(ln) !== "err") return false
			if (needle && !ln.toLowerCase().includes(needle)) return false
			return true
		})
		return kept.slice(-MAX_LINES)
	}, [log, q, onlyErrors])

	useEffect(() => {
		const el = boxRef.current
		if (el && autoscroll) el.scrollTop = el.scrollHeight
	}, [lines, autoscroll])

	const errors = useMemo(() => (log || "").split("\n").filter((ln) => logLineTone(ln) === "err").length, [log])

	return (
		<Card
			className="mt-4"
			title={
				<span className="flex items-center gap-2">
					<Terminal className="h-4 w-4 text-cyan" />
					{L("کنسول زنده", "Live console")}
				</span>
			}
			subtitle={log ? `${(log.length / 1024).toFixed(1)} KB · ${lines.length} ${L("خط", "lines")}${errors ? ` · ${errors} ${L("خطا", "errors")}` : ""}` : undefined}
			actions={
				<div className="flex flex-wrap items-center gap-1.5">
					<Input className="w-36" placeholder={L("جستجو در لاگ", "Filter log")} value={q} onChange={(e) => setQ(e.target.value)} />
					<button type="button" onClick={() => setOnlyErrors((v) => !v)} className={cx("badge cursor-pointer", onlyErrors ? "badge-danger" : "badge-muted")}>
						{L("فقط خطاها", "Errors only")}
					</button>
					<button type="button" onClick={() => setWrap((v) => !v)} className={cx("badge cursor-pointer", wrap ? "badge-violet" : "badge-muted")}>
						{L("شکست خط", "Wrap")}
					</button>
					<button type="button" onClick={() => setAutoscroll((v) => !v)} className={cx("badge cursor-pointer", autoscroll ? "badge-cyan" : "badge-muted")}>
						{L("اسکرول خودکار", "Auto-scroll")}
					</button>
					<button type="button" onClick={() => setTall((v) => !v)} className={cx("badge cursor-pointer", tall ? "badge-cyan" : "badge-muted")}>
						{tall ? L("کوچک", "Shrink") : L("بزرگ", "Expand")}
					</button>
					<Button type="button" variant="ghost" size="icon" title={L("تازه‌سازی", "Refresh")} onClick={onRefresh}>
						<ScrollText className="h-4 w-4" />
					</Button>
					<Button type="button" variant="ghost" size="icon" title={L("کپی", "Copy")} onClick={() => onCopy(log)} disabled={!log}>
						<Copy className="h-4 w-4" />
					</Button>
					<Button type="button" variant="ghost" size="icon" title={L("دانلود", "Download")} onClick={() => downloadLog(log)} disabled={!log}>
						<Download className="h-4 w-4" />
					</Button>
				</div>
			}
		>
			<pre
				ref={boxRef}
				dir="ltr"
				className={cx(
					"scrollbar-thin overflow-auto rounded-xl bg-black/40 p-3 font-mono text-xs leading-5",
					tall ? "max-h-[70vh]" : "max-h-96",
					wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre",
				)}
			>
				{!log ? (
					L("هنوز لاگی نیست.", "No log yet.")
				) : lines.length === 0 ? (
					L("خطی با این فیلتر پیدا نشد.", "No line matches this filter.")
				) : (
					lines.map((ln, i) => {
						const tone = logLineTone(ln)
						return (
							<div key={`${i}-${ln.slice(0, 12)}`} className={cx(tone === "err" && "text-danger", tone === "warn" && "text-warning", tone === "ok" && "text-success")}>
								{ln || "\u00a0"}
							</div>
						)
					})
				)}
			</pre>
		</Card>
	)
}
