"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react"
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react"
import { statusTone, usageTone } from "@/lib/format"
import { useT } from "@/lib/i18n"
import type { DictKey } from "@/lib/dict"

import { cx } from "@/lib/cx"
export { cx }

/* ---------- Button ---------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "default" | "primary" | "danger" | "ghost"
	size?: "sm" | "md" | "icon"
	loading?: boolean
}
export function Button({ variant = "default", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
	return (
		<button
			className={cx("btn", variant === "primary" && "btn-primary", variant === "danger" && "btn-danger", variant === "ghost" && "btn-ghost", size === "sm" && "btn-sm", size === "icon" && "btn-icon", className)}
			disabled={disabled || loading}
			{...rest}
		>
			{loading && <Loader2 className="h-4 w-4 spin" />}
			{children}
		</button>
	)
}

/* ---------- Form fields ---------- */
export function Field({ label, hint, children, className }: { label?: string; hint?: string; children: ReactNode; className?: string }) {
	return (
		<label className={cx("field block", className)}>
			{label && <span className="label">{label}</span>}
			{children}
			{hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
		</label>
	)
}
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
	return <input className={cx("input", className)} {...rest} />
}
export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
	return <select className={cx("select", className)} {...rest} />
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return <textarea className={cx("textarea min-h-20", className)} {...rest} />
}
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
	return (
		<button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2 text-sm" aria-pressed={checked}>
			<span className={cx("inline-flex h-5 w-9 items-center rounded-full p-0.5 transition", checked ? "justify-end bg-violet" : "justify-start bg-line")}>
				<span className="h-4 w-4 rounded-full bg-white shadow transition" />
			</span>
			{label && <span>{label}</span>}
		</button>
	)
}

/* ---------- Card ---------- */
export function Card({ title, subtitle, actions, children, className, bodyClassName }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
	return (
		<section className={cx("glass fade-up", className)}>
			{(title || actions) && (
				<header className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
					<div>
						{title && <h3 className="text-sm font-semibold">{title}</h3>}
						{subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
					</div>
					{actions && <div className="flex items-center gap-2">{actions}</div>}
				</header>
			)}
			<div className={cx("px-5 pb-5", !title && !actions && "pt-5", bodyClassName)}>{children}</div>
		</section>
	)
}

/* ---------- Badge ---------- */
export function Badge({ tone = "muted", children, className }: { tone?: "success" | "warning" | "danger" | "muted" | "violet" | "cyan"; children: ReactNode; className?: string }) {
	return <span className={cx("badge", `badge-${tone}`, className)}>{children}</span>
}
export function StatusBadge({ status }: { status: string }) {
	const t = useT()
	const key = `st_${status}` as DictKey
	return (
		<Badge tone={statusTone(status)}>
			<span className={cx("h-1.5 w-1.5 rounded-full bg-current", (status === "ONLINE" || status === "ACTIVE") && "pulse-dot")} />
			{t(key)}
		</Badge>
	)
}

/* ---------- Progress ---------- */
export function Progress({ value, className }: { value: number; className?: string }) {
	const pct = Math.max(0, Math.min(100, value))
	return (
		<div className={cx("progress", usageTone(pct), className)}>
			<span style={{ width: `${pct}%` }} />
		</div>
	)
}

/* ---------- Stat tile ---------- */
export function Stat({ label, value, sub, icon, accent = "violet" }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; accent?: "violet" | "cyan" | "magenta" | "success" | "warning" | "danger" }) {
	const colors: Record<string, string> = {
		violet: "from-violet/30 to-violet/5 text-violet-soft",
		cyan: "from-cyan/30 to-cyan/5 text-cyan",
		magenta: "from-magenta/30 to-magenta/5 text-magenta",
		success: "from-success/30 to-success/5 text-success",
		warning: "from-warning/30 to-warning/5 text-warning",
		danger: "from-danger/30 to-danger/5 text-danger",
	}
	return (
		<div className="glass fade-up flex items-center gap-4 p-4">
			{icon && <div className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br", colors[accent])}>{icon}</div>}
			<div className="min-w-0">
				<div className="text-xs text-muted">{label}</div>
				<div className="num truncate text-xl font-bold">{value}</div>
				{sub && <div className="text-[11px] text-muted">{sub}</div>}
			</div>
		</div>
	)
}

/* ---------- Tabs (segmented) ---------- */
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: Array<{ id: T; label: string; icon?: ReactNode; count?: ReactNode }>; value: T; onChange: (id: T) => void; className?: string }) {
	return (
		<div className={cx("seg scrollbar-thin overflow-x-auto", className)} role="tablist">
			{tabs.map((x) => (
				<button key={x.id} type="button" role="tab" aria-selected={value === x.id} onClick={() => onChange(x.id)} className={cx("seg-item", value === x.id && "active")}>
					{x.icon}
					{x.label}
					{x.count !== undefined && x.count !== null && <span className="badge badge-muted num">{x.count}</span>}
				</button>
			))}
		</div>
	)
}

/* ---------- Section heading inside a card ---------- */
export function SubHead({ title, hint, actions, className }: { title: ReactNode; hint?: ReactNode; actions?: ReactNode; className?: string }) {
	return (
		<div className={cx("mb-3 flex flex-wrap items-end justify-between gap-2", className)}>
			<div>
				<div className="text-sm font-semibold">{title}</div>
				{hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</div>
	)
}

/* ---------- Empty / Spinner ---------- */
export function Empty({ text, action }: { text?: string; action?: ReactNode }) {
	const t = useT()
	return (
		<div className="flex flex-col items-center justify-center gap-3 py-14 text-center text-sm text-muted">
			<div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet/30 to-cyan/10" />
			<p>{text ?? t("nothing_here")}</p>
			{action}
		</div>
	)
}
export function Spinner({ className }: { className?: string }) {
	return <Loader2 className={cx("h-5 w-5 spin text-violet-soft", className)} />
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, subtitle, children, footer, wide, size }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; size?: "md" | "lg" | "xl" }) {
	useEffect(() => {
		if (!open) return
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
		window.addEventListener("keydown", onKey)
		document.body.style.overflow = "hidden"
		return () => {
			window.removeEventListener("keydown", onKey)
			document.body.style.overflow = ""
		}
	}, [open, onClose])
	if (!open) return null
	const width = size === "xl" ? "sm:max-w-5xl" : size === "lg" || wide ? "sm:max-w-3xl" : "sm:max-w-lg"
	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
			{/* flex column + min-h-0 on the body: long forms scroll instead of spilling out of the card */}
			<div className={cx("glass glass-2 fade-up flex max-h-[92vh] w-full flex-col overflow-hidden rounded-b-none sm:max-h-[88vh] sm:rounded-b-[var(--radius-glass)]", width)} role="dialog" aria-modal>
				<header className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-3.5">
					<div className="min-w-0">
						<h3 className="truncate text-sm font-semibold">{title}</h3>
						{subtitle && <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p>}
					</div>
					<Button size="icon" variant="ghost" onClick={onClose} aria-label="close">
						<X className="h-4 w-4" />
					</Button>
				</header>
				<div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
				{footer && <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-5 py-3">{footer}</footer>}
			</div>
		</div>
	)
}

/* ---------- Toasts ---------- */
type Toast = { id: number; kind: "ok" | "err"; text: string }
const ToastCtx = createContext<{ push: (kind: Toast["kind"], text: string) => void }>({ push: () => undefined })

export function ToastProvider({ children }: { children: ReactNode }) {
	const [items, setItems] = useState<Toast[]>([])
	const push = useCallback((kind: Toast["kind"], text: string) => {
		const id = Date.now() + Math.random()
		setItems((s) => [...s, { id, kind, text }])
		setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4200)
	}, [])
	return (
		<ToastCtx.Provider value={{ push }}>
			{children}
			<div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2">
				{items.map((t) => (
					<div key={t.id} className={cx("glass glass-2 fade-up flex items-start gap-2 px-4 py-3 text-sm", t.kind === "err" ? "border-danger/40" : "border-success/40")}>
						{t.kind === "err" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
						<span className="break-words">{t.text}</span>
					</div>
				))}
			</div>
		</ToastCtx.Provider>
	)
}
export function useToast() {
	const { push } = useContext(ToastCtx)
	return { ok: (text: string) => push("ok", text), err: (text: string) => push("err", text) }
}

/* ---------- Confirm ---------- */
export function useConfirm() {
	const t = useT()
	return (text?: string) => window.confirm(text ?? t("confirm_delete"))
}

/* ---------- Page header ---------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
	return (
		<div className="mb-5 flex flex-wrap items-end justify-between gap-3">
			<div>
				<h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
				{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
			</div>
			{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
		</div>
	)
}
