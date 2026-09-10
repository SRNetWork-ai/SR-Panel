"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import { Activity, DatabaseBackup, Globe2, LayoutDashboard, LogOut, Menu, Moon, Plug, ScrollText, Server, Settings, ShieldCheck, ShoppingCart, Store, Sun, Users, Wallet, X } from "lucide-react"
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

const NAV: Array<{ href: string; key: DictKey; icon: typeof LayoutDashboard; owner?: boolean }> = [
	{ href: "/dashboard", key: "nav_dashboard", icon: LayoutDashboard },
	{ href: "/clients", key: "nav_clients", icon: Users },
	{ href: "/store", key: "nav_store", icon: Store },
	{ href: "/orders", key: "nav_orders", icon: ShoppingCart },
	{ href: "/wallet", key: "nav_wallet", icon: Wallet },
	{ href: "/servers", key: "nav_servers", icon: Server },
	{ href: "/monitoring", key: "nav_monitoring", icon: Activity, owner: true },
	{ href: "/admins", key: "nav_admins", icon: ShieldCheck, owner: true },
	{ href: "/backups", key: "nav_backups", icon: DatabaseBackup, owner: true },
	{ href: "/integrations", key: "nav_integrations", icon: Plug },
	{ href: "/audit", key: "nav_audit", icon: ScrollText, owner: true },
	{ href: "/settings", key: "nav_settings", icon: Settings },
]

function setCookie(name: string, value: string) {
	document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
}

export function AppShell({ user, brandName, theme, children }: { user: ShellUser; brandName: string; theme: "dark" | "light"; children: ReactNode }) {
	const t = useT()
	const locale = useLocale()
	const pathname = usePathname()
	const router = useRouter()
	const [open, setOpen] = useState(false)
	const [mode, setMode] = useState(theme)

	const items = NAV.filter((n) => !n.owner || user.role === "OWNER")

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

	const nav = (
		<nav className="flex flex-1 flex-col gap-1">
			{items.map((n) => {
				const active = pathname === n.href || pathname.startsWith(n.href + "/")
				const Icon = n.icon
				return (
					<Link key={n.href} href={n.href} className={cx("nav-item", active && "active")} onClick={() => setOpen(false)}>
						<Icon className="h-4.5 w-4.5" />
						<span>{t(n.key)}</span>
					</Link>
				)
			})}
		</nav>
	)

	const footer = (
		<div className="mt-auto space-y-3">
			<div className="glass flex items-center gap-3 p-3">
				<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet to-cyan text-sm font-bold text-white">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</div>
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-medium">{user.displayName || user.username}</div>
					<div className="text-[11px] text-muted">{user.role === "OWNER" ? t("owner") : t("admin")}</div>
				</div>
				<Button size="icon" variant="ghost" onClick={logout} title={t("logout")}>
					<LogOut className="h-4 w-4" />
				</Button>
			</div>
			<div className="flex items-center gap-2">
				<Button size="sm" className="flex-1" onClick={toggleTheme} title={t("theme_toggle")}>
					{mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
				</Button>
				<Button size="sm" className="flex-1" onClick={toggleLocale} title={t("language")}>
					<Globe2 className="h-4 w-4" />
					<span className="text-xs">{locale === "fa" ? "EN" : "فا"}</span>
				</Button>
			</div>
		</div>
	)

	return (
		<div className="min-h-dvh">
			<div className="aurora" />
			{/* desktop sidebar */}
			<aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col gap-6 p-4 lg:flex">
				<div className="glass flex h-full flex-col gap-6 p-4">
					<Logo name={brandName} />
					{nav}
					{footer}
				</div>
			</aside>

			{/* mobile drawer */}
			{open && (
				<div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
					<div className="glass glass-2 fade-up absolute inset-y-0 start-0 flex w-72 flex-col gap-6 rounded-none p-4" onClick={(e) => e.stopPropagation()}>
						<div className="flex items-center justify-between">
							<Logo name={brandName} />
							<Button size="icon" variant="ghost" onClick={() => setOpen(false)}>
								<X className="h-4 w-4" />
							</Button>
						</div>
						{nav}
						{footer}
					</div>
				</div>
			)}

			{/* header (mobile) */}
			<header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 backdrop-blur-xl lg:hidden">
				<Button size="icon" onClick={() => setOpen(true)} aria-label="menu">
					<Menu className="h-5 w-5" />
				</Button>
				<Logo name={brandName} compact />
				<Button size="icon" variant="ghost" onClick={toggleTheme}>
					{mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
				</Button>
			</header>

			<main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-2 lg:ps-72 lg:pt-6 lg:pb-10">{children}</main>

			{/* mobile bottom nav */}
			<nav className="glass glass-2 fixed inset-x-3 bottom-3 z-30 flex items-center justify-around px-2 py-1.5 lg:hidden">
				{items.slice(0, 5).map((n) => {
					const active = pathname.startsWith(n.href)
					const Icon = n.icon
					return (
						<Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px]", active ? "text-violet-soft" : "text-muted")}>
							<Icon className="h-5 w-5" />
							{t(n.key)}
						</Link>
					)
				})}
			</nav>
		</div>
	)
}

export function LiveDot({ on }: { on: boolean }) {
	return <Activity className={cx("h-3.5 w-3.5", on ? "text-success pulse-dot" : "text-muted")} />
}
