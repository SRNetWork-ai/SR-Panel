import { prisma } from "@srpanel/db"
import { buildLinks, userInfoHeader, type StoredInbound } from "../subscription/links"
import { configLabel } from "../util/naming"
import { inboundsOf, publicHostOf, serverHostContextOf } from "./servers"
import { panelUrl } from "./settings"

export interface SubUsagePoint {
	/** YYYY-MM-DD */
	date: string
	up: number
	down: number
	total: number
}

export interface SubServerInfo {
	name: string
	configs: number
	online: boolean
}

export interface SubscriptionPayload {
	client: {
		id: string
		name: string
		tag: string | null
		status: string
		usedBytes: number
		usedUp: number
		usedDown: number
		trafficLimit: number
		expiresAt: string | null
		createdAt: string
		lastOnlineAt: string | null
		ipLimit: number
		subTheme: string | null
		serviceName: string | null
	}
	brand: { name: string; tagline: string | null; logoUrl: string | null; primaryColor: string; accentColor: string; supportUrl: string | null; telegramUrl: string | null }
	links: Array<{ server: string; remark: string; uri: string }>
	/**
	 * Informational pseudo-config (never connects) placed first in the app list so
	 * the customer sees quota / expiry right inside v2rayNG, Hiddify, Streisand…
	 */
	infoUri: string | null
	servers: SubServerInfo[]
	/** last 14 days, aggregated per day */
	usage: SubUsagePoint[]
	stats: { usedPct: number; remainingBytes: number | null; daysLeft: number | null; dailyAvgBytes: number; last7Bytes: number }
	/** subscription url for the apps + the page itself + optional renew link */
	subUrl: string
	pageUrl: string
	renewUrl: string | null
	userInfo: string
	/** Full base64 body understood by v2ray-compatible apps */
	base64: string
}

const DEFAULT_BRAND = {
	name: process.env.SRP_BRAND_NAME || "SRPanel",
	tagline: null as string | null,
	logoUrl: null as string | null,
	primaryColor: "#8b5cf6",
	accentColor: "#22d3ee",
	supportUrl: null as string | null,
	telegramUrl: null as string | null,
}

const DAY = 86_400_000
/** A syntactically valid VLESS link pointing nowhere: apps list it but can never dial it. */
const VOID_URI = "vless://00000000-0000-0000-0000-000000000000@127.0.0.1:1?type=tcp&security=none#"

/**
 * Hourly samples are stored as counters; when the series is non-decreasing we
 * treat consecutive differences as the real traffic, otherwise the values are
 * already deltas. This keeps the chart correct for both writers.
 */
function dailyUsage(samples: Array<{ at: Date; up: bigint; down: bigint }>): SubUsagePoint[] {
	if (!samples.length) return []
	const cumulative = samples.every((s, i) => i === 0 || Number(s.up) + Number(s.down) >= Number(samples[i - 1].up) + Number(samples[i - 1].down))
	const byDay = new Map<string, { up: number; down: number }>()
	for (let i = 0; i < samples.length; i++) {
		const s = samples[i]
		const prev = i > 0 ? samples[i - 1] : null
		const up = cumulative ? Math.max(0, Number(s.up) - Number(prev?.up ?? s.up)) : Number(s.up)
		const down = cumulative ? Math.max(0, Number(s.down) - Number(prev?.down ?? s.down)) : Number(s.down)
		const key = s.at.toISOString().slice(0, 10)
		const row = byDay.get(key) ?? { up: 0, down: 0 }
		row.up += up
		row.down += down
		byDay.set(key, row)
	}
	return [...byDay.entries()].map(([date, v]) => ({ date, up: v.up, down: v.down, total: v.up + v.down })).sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** Resolves a subscription token to links + metadata. Returns null for unknown tokens. */
export async function buildSubscription(subToken: string): Promise<SubscriptionPayload | null> {
	const client = await prisma.client.findUnique({
		where: { subToken },
		include: { servers: { include: { server: true } }, admin: { include: { brand: true, store: true } } },
	})
	if (!client) return null

	const active = client.status === "ACTIVE"
	const links: SubscriptionPayload["links"] = []
	if (active) {
		// every config carries the typed name (prefixed with the client tag); the
		// server / inbound is only appended when it is needed to tell them apart
		const label = configLabel(client)
		const serverCount = new Set(client.servers.map((s) => s.serverId)).size
		for (const link of client.servers) {
			if (!link.server.isActive) continue
			const inbound = inboundsOf(link.server).find((i: StoredInbound) => i.id === link.inboundId)
			if (!inbound || !inbound.enable) continue
			const parts = [label]
			if (serverCount > 1) parts.push(link.server.name)
			if (client.servers.filter((s) => s.serverId === link.serverId).length > 1) parts.push(inbound.remark || inbound.protocol)
			const remark = parts.join(" • ")
			// `server` lets buildLinks prefer the address configured on the inbound over the panel domain
			const opts = { host: publicHostOf(link.server), remark, server: serverHostContextOf(link.server) }
			for (const uri of buildLinks(inbound, { uuid: client.uuid, email: link.remoteEmail }, opts)) {
				links.push({ server: link.server.name, remark, uri })
			}
		}
	}

	const ownerBrand = client.admin.brand
	const brand = ownerBrand
		? {
				name: ownerBrand.name,
				tagline: ownerBrand.tagline,
				logoUrl: ownerBrand.logoUrl,
				primaryColor: ownerBrand.primaryColor,
				accentColor: ownerBrand.accentColor,
				supportUrl: ownerBrand.supportUrl,
				telegramUrl: ownerBrand.telegramUrl,
		  }
		: await defaultBrand()

	const [samples, service] = await Promise.all([
		prisma.clientUsage.findMany({ where: { clientId: client.id, at: { gte: new Date(Date.now() - 14 * DAY) } }, orderBy: { at: "asc" }, select: { at: true, up: true, down: true }, take: 400 }),
		client.serviceId ? prisma.service.findUnique({ where: { id: client.serviceId }, select: { name: true } }) : Promise.resolve(null),
	])
	const usage = dailyUsage(samples)
	const last7 = usage.slice(-7)
	const last7Bytes = last7.reduce((sum, d) => sum + d.total, 0)

	const usedUp = Number(client.usedUp)
	const usedDown = Number(client.usedDown)
	const usedBytes = usedUp + usedDown
	const trafficLimit = Number(client.trafficLimit)
	const daysLeft = client.expiresAt ? Math.ceil((client.expiresAt.getTime() - Date.now()) / DAY) : null
	const userInfo = userInfoHeader({
		upload: usedUp,
		download: usedDown,
		total: trafficLimit,
		expire: client.expiresAt ? Math.floor(client.expiresAt.getTime() / 1000) : 0,
	})

	// a verified custom domain keeps every customer-facing link white-label
	const domain = ownerBrand?.customDomain && ownerBrand.domainVerified ? ownerBrand.customDomain : null
	const base = (domain ? "https://" + domain : panelUrl()).replace(/\/+$/, "")
	const store = client.admin.store

	const byServer = new Map<string, SubServerInfo>()
	for (const l of client.servers) {
		const row = byServer.get(l.serverId) ?? { name: l.server.name, configs: 0, online: l.server.isActive && l.server.status !== "OFFLINE" }
		row.configs += 1
		byServer.set(l.serverId, row)
	}

	// The first entry is always the read-only info line; when the account is not usable we
	// additionally return one notice "link" so apps show a reason instead of an empty list.
	const infoUri = voidConfig(
		infoRemark({
			brandName: brand.name,
			status: client.status,
			usedBytes,
			trafficLimit,
			daysLeft,
			pending: client.expiresAt === null && (client.status === "ACTIVE" ? usedBytes === 0 : false),
			serviceName: service?.name ?? null,
		}),
	)
	const body = [infoUri, ...(links.length ? links.map((l) => l.uri) : [statusNotice(client.status, brand.name)])].join("\n")

	return {
		client: {
			id: client.id,
			name: client.name,
			tag: client.tag,
			status: client.status,
			usedBytes,
			usedUp,
			usedDown,
			trafficLimit,
			expiresAt: client.expiresAt?.toISOString() ?? null,
			createdAt: client.createdAt.toISOString(),
			lastOnlineAt: client.lastOnlineAt?.toISOString() ?? null,
			ipLimit: client.ipLimit,
			subTheme: client.subTheme,
			serviceName: service?.name ?? null,
		},
		brand,
		links,
		infoUri,
		servers: [...byServer.values()],
		usage,
		stats: {
			usedPct: trafficLimit > 0 ? Math.min(100, Math.round((usedBytes / trafficLimit) * 100)) : 0,
			remainingBytes: trafficLimit > 0 ? Math.max(0, trafficLimit - usedBytes) : null,
			daysLeft,
			dailyAvgBytes: last7.length ? Math.round(last7Bytes / last7.length) : 0,
			last7Bytes,
		},
		subUrl: base + "/sub/" + subToken,
		pageUrl: base + "/s/" + subToken,
		renewUrl: store?.enabled && store.slug ? base + "/shop/" + store.slug + "?renew=" + subToken : null,
		userInfo,
		base64: Buffer.from(body, "utf8").toString("base64"),
	}
}

/** Wraps a remark into the unusable VLESS URI apps happily display. */
function voidConfig(remark: string): string {
	return VOID_URI + encodeURIComponent(remark)
}

function humanBytes(bytes: number): string {
	const gb = bytes / 1024 ** 3
	if (gb >= 100) return Math.round(gb) + "GB"
	if (gb >= 1) return Math.round(gb * 10) / 10 + "GB"
	const mb = bytes / 1024 ** 2
	return Math.max(0, Math.round(mb)) + "MB"
}

function usageBar(pct: number): string {
	const filled = Math.max(0, Math.min(10, Math.round(pct / 10)))
	return "▰".repeat(filled) + "▱".repeat(10 - filled)
}

function statusLabel(status: string): string {
	if (status === "EXPIRED") return "منقضی شده"
	if (status === "LIMITED") return "حجم به پایان رسیده"
	if (status === "DISABLED") return "غیرفعال"
	return "فعال"
}

/** The single line every app shows as a config name: quota, remaining days, state. */
function infoRemark(p: { brandName: string; status: string; usedBytes: number; trafficLimit: number; daysLeft: number | null; pending: boolean; serviceName: string | null }): string {
	const parts: string[] = []
	if (p.trafficLimit > 0) {
		const pct = Math.min(100, Math.round((p.usedBytes / p.trafficLimit) * 100))
		parts.push(usageBar(pct) + " " + pct + "٪")
		parts.push("مصرف " + humanBytes(p.usedBytes) + " از " + humanBytes(p.trafficLimit))
		parts.push("باقی " + humanBytes(Math.max(0, p.trafficLimit - p.usedBytes)))
	} else {
		parts.push("مصرف " + humanBytes(p.usedBytes) + " • حجم نامحدود")
	}
	if (p.daysLeft === null) parts.push(p.pending ? "شروع پس از اولین اتصال" : "بدون تاریخ انقضا")
	else if (p.daysLeft >= 0) parts.push(p.daysLeft + " روز باقی‌مانده")
	else parts.push("منقضی شده")
	if (p.status !== "ACTIVE") parts.push(statusLabel(p.status))
	if (p.serviceName) parts.push(p.serviceName)
	return "ℹ️ " + p.brandName + " ➜ " + parts.join(" | ")
}

function statusNotice(status: string, brandName: string): string {
	// An unusable link that carries the reason as its remark.
	return voidConfig(brandName + " • " + (status === "ACTIVE" ? "سروری در دسترس نیست" : statusLabel(status)))
}

async function defaultBrand() {
	const owner = await prisma.admin.findFirst({ where: { role: "OWNER" }, include: { brand: true } })
	if (owner?.brand) {
		const b = owner.brand
		return { name: b.name, tagline: b.tagline, logoUrl: b.logoUrl, primaryColor: b.primaryColor, accentColor: b.accentColor, supportUrl: b.supportUrl, telegramUrl: b.telegramUrl }
	}
	return { ...DEFAULT_BRAND }
}
