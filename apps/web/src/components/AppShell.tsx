"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { Activity, ArrowDownToLine, DatabaseBackup, Globe2, LayoutDashboard, LogOut, Menu, Moon, Plug, ScrollText, Server, Settings, ShieldCheck, ShoppingCart, Store, Sun, Users, Wallet, X } from "lucide-react"
import { api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import type { DictKey } from "@/lib/dict"
import { Button, cx } from "./ui"
import { Logo } from "./Logo"

export interface ShellUser {
	username: string
	displayName: string | null
	role: "OWNER" | "ADMIN"
}

type NavItem = { href: string; key?: DictKey; label?: [string, string]; icon: typeof LayoutDashboard; owner?: boolean }
type NavGroup = { id: string; label: [string, string]; items: NavItem[] }

const GROUPS: NavGroup[] = [
	{
		id: "main",
		label: ["اصلی", "Main"],
		items: [
			{ href: "/dashboard", key: "nav_dashboard", icon: LayoutDashboard },
			{ href: "/clients", key: "nav_clients", icon: Users },
		],
	},
	{
		id: "sales",
		label: ["فروش", "Sales"],
		items: [
			{ href: "/store", key: "nav_store", icon: Store },
			{ href: "/orders", key: "nav_orders", icon: ShoppingCart },
			{ href: "/wallet", key: "nav_wallet", icon: Wallet },
		],
	},
	{
		id: "infra",
		label: ["زیرساخت", "Infrastructure"],
		items: [
			{ href: "/servers", key: "nav_servers", icon: Server },
			{ href: "/monitoring", key: "nav_monitoring", icon: Activity, owner: true },
		],
	},
	{
		id: "admin",
		label: ["مدیریت", "Administration"],
		items: [
			{ href: "/admins", key: "nav_admins", icon: ShieldCheck, owner: true },
			{ href: "/backups", key: "nav_backups", icon: DatabaseBackup, owner: true },
			{ href: "/integrations", key: "nav_integrations", icon: Plug },
			{ href: "/audit", key: "nav_audit", icon: ScrollText, owner: true },
			{ href: "/updates", label: ["به\u200cروزرسانی", "Updates"], icon: ArrowDownToLine, owner: true },
			{ href: "/settings", key: "nav_settings", icon: Settings },
		],
	},
]

function setCookie(name: string, value: string) {
	document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
}

export function AppShell({ user, brandName, theme, children }: { user: ShellUser; brandName: string; theme: "dark" | "light"; children: ReactNode }) {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const pathname = usePathname()
	const router = useRouter()
	const [open, setOpen] = useState(false)
	const [rail, setRail] = useState(false)
	const [mode, setMode] = useState(theme)

	useEffect(() => {
		try {
			setRail(window.localStorage.getItem("srp_nav_rail") === "1")
		} catch {
			/* private mode */
		}
	}, [])
	useEffect(() => setOpen(false), [pathname])

	const isOwner = user.role === "OWNER"
	const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => !n.owner || isOwner) })).filter((g) => g.items.length > 0)
	const flat = groups.flatMap((g) => g.items)
	const navLabel = (n: NavItem) => (n.label ? n.label[locale === "fa" ? 0 : 1] : t(n.key as DictKey))
	const groupLabel = (g: NavGroup) => g.label[locale === "fa" ? 0 : 1]

	const toggleRail = () => {
		const next = !rail
		setRail(next)
		try {
			window.localStorage.setItem("srp_nav_rail", next ? "1" : "0")
		} catch {
			/* ignore */
		}
	}
	const toggleTheme = () => {
		const next = mode === "dark" ? "light" : "dark"
		setMode(next)
		document.documentElement.classList.toggle("light", next === "light")
		setCookie("srp_theme", next)
	}
	const toggleLocale = () => {
		setCookie("srp_lang", locale === "fa" ? "en" : "fa")
		router.refresh()
	}
	const logout = async () => {
		await api("/api/auth/logout", { method: "POST" }).catch(() => undefined)
		router.replace("/login")
	}

	const navList = (compact: boolean) => (
		<nav className={cx("scrollbar-thin flex flex-1 flex-col gap-0.5 overflow-y-auto pe-1", compact && "nav-rail")}>
			{groups.map((g) => (
				<div key={g.id} className="flex flex-col gap-0.5">
					{compact ? <div className="mx-auto my-2 h-px w-6 bg-line" /> : <div className="nav-group"><span className="nav-group-label">{groupLabel(g)}</span></div>}
					{g.items.map((n) => {
						const active = pathname === n.href || pathname.startsWith(n.href + "/")
						const Icon = n.icon
						return (
							<Link key={n.href} href={n.href} title={navLabel(n)} aria-current={active ? "page" : undefined} className={cx("nav-item", active && "active")} onClick={() => setOpen(false)}>
								<span className="nav-ico">
									<Icon className="h-4 w-4" />
								</span>
								<span className="nav-label truncate">{navLabel(n)}</span>
							</Link>
						)
					})}
				</div>
			))}
		</nav>
	)

	const footer = (compact: boolean) => (
		<div className="mt-auto space-y-2 pt-2">
			<div className={cx("glass flex items-center gap-3 p-2.5", compact && "justify-center p-2")}>
				<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet to-cyan text-sm font-bold text-white">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</div>
				{!compact && (
					<>
						<div className="min-w-0 flex-1">
							<div className="truncate text-sm font-medium">{user.displayName || user.username}</div>
							<div className="text-[11px] text-muted">{isOwner ? L("مالک", "Owner") : L("ادمین", "Admin")}</div>
						</div>
						<Button size="icon" variant="ghost" onClick={logout} title={L("خروج", "Sign out")}>
							<LogOut className="h-4 w-4" />
						</Button>
					</>
				)}
			</div>
			<div className={cx("flex items-center gap-2", compact && "flex-col")}>
				<Button size="sm" className={compact ? "w-full" : "flex-1"} onClick={toggleTheme} title={L("تغییر تم", "Toggle theme")}>
					{mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
				</Button>
				<Button size="sm" className={compact ? "w-full" : "flex-1"} onClick={toggleLocale} title={L("تغییر زبان", "Change language")}>
					<Globe2 className="h-4 w-4" />
					{!compact && <span className="text-xs">{locale === "fa" ? "EN" : "فا"}</span>}
				</Button>
				{compact && (
					<Button size="sm" className="w-full" onClick={logout} title={L("خروج", "Sign out")}>
						<LogOut className="h-4 w-4" />
					</Button>
				)}
			</div>
		</div>
	)

	return (
		<div className="min-h-dvh">
			<div className="aurora" />
			{/* desktop sidebar (collapsible) */}
			<aside className={cx("fixed inset-y-0 start-0 z-30 hidden flex-col p-3 transition-all duration-300 lg:flex", rail ? "w-[92px]" : "w-64")}>
				<div className="glass sheen flex h-full flex-col gap-2 p-3">
					<div className={cx("flex items-center gap-2", rail ? "justify-center" : "justify-between")}>
						{!rail && <Logo name={brandName} />}
						<Button size="icon" variant="ghost" onClick={toggleRail} title={rail ? L("باز کردن منو", "Expand menu") : L("جمع کردن منو", "Collapse menu")} aria-label="toggle sidebar" aria-expanded={!rail}>
							<Menu className="h-5 w-5" />
						</Button>
					</div>
					{navList(rail)}
					{footer(rail)}
				</div>
			</aside>

			{/* mobile drawer */}
			{open && (
				<div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
					<div className="glass glass-2 fade-up absolute inset-y-0 start-0 flex w-72 flex-col gap-2 rounded-none p-4" onClick={(e) => e.stopPropagation()}>
						<div className="flex items-center justify-between">
							<Logo name={brandName} />
							<Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="close menu">
								<X className="h-4 w-4" />
							</Button>
						</div>
						{navList(false)}
						{footer(false)}
					</div>
				</div>
			)}

			{/* header (mobile) */}
			<header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 backdrop-blur-xl lg:hidden">
				<Button size="icon" onClick={() => setOpen(true)} aria-label="menu" title={L("منو", "Menu")}>
					<Menu className="h-5 w-5" />
				</Button>
				<Logo name={brandName} compact />
				<Button size="icon" variant="ghost" onClick={toggleTheme}>
					{mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
				</Button>
			</header>

			<main className={cx("mx-auto w-full max-w-7xl px-4 pb-24 pt-2 transition-all duration-300 lg:pb-10 lg:pt-6", rail ? "lg:ps-28" : "lg:ps-72")}>{children}</main>

			{/* mobile bottom nav */}
			<nav className="glass glass-2 fixed inset-x-3 bottom-3 z-30 flex items-center justify-around px-2 py-1.5 lg:hidden">
				{flat.slice(0, 5).map((n) => {
					const active = pathname.startsWith(n.href)
					const Icon = n.icon
					return (
						<Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px]", active ? "text-violet-soft" : "text-muted")}>
							<Icon className="h-5 w-5" />
							{navLabel(n)}
						</Link>
					)
				})}
				<button type="button" onClick={() => setOpen(true)} aria-label="menu" className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] text-muted">
					<Menu className="h-5 w-5" />
					{locale === "fa" ? "منو" : "More"}
				</button>
			</nav>
		</div>
	)
}

export function LiveDot({ on }: { on: boolean }) {
	return <Activity className={cx("h-3.5 w-3.5", on ? "text-success pulse-dot" : "text-muted")} />
}
