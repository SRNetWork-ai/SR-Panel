import { prisma } from "@srpanel/db"
import { buildLinks, userInfoHeader, type StoredInbound } from "../subscription/links"
import { inboundsOf, publicHostOf, serverHostContextOf } from "./servers"

export interface SubscriptionPayload {
	client: {
		id: string
		name: string
		status: string
		usedBytes: number
		trafficLimit: number
		expiresAt: string | null
		lastOnlineAt: string | null
		subTheme: string | null
	}
	brand: { name: string; tagline: string | null; logoUrl: string | null; primaryColor: string; accentColor: string; supportUrl: string | null; telegramUrl: string | null }
	links: Array<{ server: string; remark: string; uri: string }>
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

/** Resolves a subscription token to links + metadata. Returns null for unknown tokens. */
export async function buildSubscription(subToken: string): Promise<SubscriptionPayload | null> {
	const client = await prisma.client.findUnique({
		where: { subToken },
		include: { servers: { include: { server: true } }, admin: { include: { brand: true } } },
	})
	if (!client) return null

	const active = client.status === "ACTIVE"
	const links: SubscriptionPayload["links"] = []
	if (active) {
		for (const link of client.servers) {
			if (!link.server.isActive) continue
			const inbound = inboundsOf(link.server).find((i: StoredInbound) => i.id === link.inboundId)
			if (!inbound || !inbound.enable) continue
			const remark = `${link.server.name} • ${inbound.remark || inbound.protocol}`
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

	const usedBytes = Number(client.usedUp) + Number(client.usedDown)
	const userInfo = userInfoHeader({
		upload: Number(client.usedUp),
		download: Number(client.usedDown),
		total: Number(client.trafficLimit),
		expire: client.expiresAt ? Math.floor(client.expiresAt.getTime() / 1000) : 0,
	})

	// When the account is not usable we still return one informational "link" so apps show a reason instead of an empty list.
	const body = links.length ? links.map((l) => l.uri).join("\n") : statusNotice(client.status, brand.name)

	return {
		client: {
			id: client.id,
			name: client.name,
			status: client.status,
			usedBytes,
			trafficLimit: Number(client.trafficLimit),
			expiresAt: client.expiresAt?.toISOString() ?? null,
			lastOnlineAt: client.lastOnlineAt?.toISOString() ?? null,
			subTheme: client.subTheme,
		},
		brand,
		links,
		userInfo,
		base64: Buffer.from(body, "utf8").toString("base64"),
	}
}

function statusNotice(status: string, brandName: string): string {
	const text =
		status === "EXPIRED" ? "اشتراک منقضی شده" : status === "LIMITED" ? "حجم به پایان رسیده" : status === "DISABLED" ? "اشتراک غیرفعال است" : "سروری در دسترس نیست"
	// A syntactically valid but unusable vless link that carries the message as its remark.
	return `vless://00000000-0000-0000-0000-000000000000@127.0.0.1:1?type=tcp&security=none#${encodeURIComponent(`${brandName} • ${text}`)}`
}

async function defaultBrand() {
	const owner = await prisma.admin.findFirst({ where: { role: "OWNER" }, include: { brand: true } })
	if (owner?.brand) {
		const b = owner.brand
		return { name: b.name, tagline: b.tagline, logoUrl: b.logoUrl, primaryColor: b.primaryColor, accentColor: b.accentColor, supportUrl: b.supportUrl, telegramUrl: b.telegramUrl }
	}
	return { ...DEFAULT_BRAND }
}
