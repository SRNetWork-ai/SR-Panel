import { PanelError } from "../../util/errors"
import type { InboundProtocol, ProvisionClientInput } from "../types"
import { inboundIdList, shadowsocksPassword, toTgId } from "./encoding"
import { MissingEndpointError } from "./errors"
import type { XuiHttpClient } from "./http"

/** The per-protocol client row shared by the v3 clients API and the legacy settings blob. */
export function buildClientObject(
	protocol: InboundProtocol,
	c: ProvisionClientInput,
	legacy = false,
): Record<string, unknown> {
	const tg = toTgId(c.tgId)
	const base = {
		email: c.email,
		limitIp: Number(c.limitIp) || 0,
		totalGB: Number(c.totalBytes) || 0,
		expiryTime: Number(c.expiryTimeMs) || 0,
		enable: c.enable !== false,
		// v3 expects int64, panels older than 2.4 expect a string
		tgId: legacy ? (tg ? String(tg) : "") : tg,
		subId: c.subId,
		reset: 0,
		comment: c.comment ?? "",
		group: c.group ?? "",
		limitHwid: Number(c.limitHwid) || 0,
	}
	switch (protocol) {
		case "vmess":
			return { id: c.uuid, security: "auto", ...base }
		case "trojan":
			return { password: c.uuid, flow: "", ...base }
		case "shadowsocks":
			return { method: c.ssMethod ?? "", password: shadowsocksPassword(c.ssMethod ?? "", c.uuid), ...base }
		case "vless":
		default:
			return { id: c.uuid, flow: c.flow ?? "", ...base }
	}
}

/** Legacy routes address a client by its secret: uuid for vless/vmess, password for trojan/ss. */
export function clientSecret(protocol: InboundProtocol, uuid: string, ssMethod?: string): string {
	if (protocol === "shadowsocks") return shadowsocksPassword(ssMethod ?? "", uuid)
	return uuid
}

/**
 * Creates one client attached to every given inbound - that is what the panel's own
 * client editor does. Legacy builds only know one inbound per call and reject a
 * duplicate email, so a multi-inbound request fails loudly instead of half-creating.
 */
export async function addClient(
	http: XuiHttpClient,
	inboundIds: number | number[],
	protocol: InboundProtocol,
	c: ProvisionClientInput,
): Promise<void> {
	const ids = inboundIdList(inboundIds)
	if (!ids.length) throw new PanelError("هیچ اینباندی برای ساخت کانفیگ انتخاب نشده است")
	await http.attempt<void>([
		async () => {
			await http.postJson("/panel/api/clients/add", {
				client: buildClientObject(protocol, c),
				inboundIds: ids,
			})
		},
		async () => {
			if (ids.length > 1) throw new PanelError("این نسخه از پنل، یک کلاینت روی چند اینباند را پشتیبانی نمی‌کند")
			await http.postJson("/panel/api/inbounds/addClient", {
				id: ids[0],
				settings: JSON.stringify({ clients: [buildClientObject(protocol, c, true)] }),
			})
		},
	])
}

/** The id list *is* the client's inbound membership: a partial list detaches the rest. */
export async function updateClient(
	http: XuiHttpClient,
	inboundIds: number | number[],
	protocol: InboundProtocol,
	c: ProvisionClientInput,
): Promise<void> {
	const ids = inboundIdList(inboundIds)
	if (!ids.length) throw new PanelError("هیچ اینباندی برای به‌روزرسانی کانفیگ انتخاب نشده است")
	const key = encodeURIComponent(clientSecret(protocol, c.uuid, c.ssMethod))
	await http.attempt<void>([
		async () => {
			await http.postJson(`/panel/api/clients/update/${encodeURIComponent(c.email)}`, {
				client: buildClientObject(protocol, c),
				inboundIds: ids,
			})
		},
		async () => {
			if (ids.length > 1) throw new PanelError("این نسخه از پنل، یک کلاینت روی چند اینباند را پشتیبانی نمی‌کند")
			await http.postJson(`/panel/api/inbounds/updateClient/${key}`, {
				id: ids[0],
				settings: JSON.stringify({ clients: [buildClientObject(protocol, c, true)] }),
			})
		},
	])
}

export async function deleteClient(
	http: XuiHttpClient,
	inboundIds: number | number[],
	protocol: InboundProtocol,
	c: { uuid: string; email: string; ssMethod?: string },
): Promise<void> {
	const ids = inboundIdList(inboundIds)
	const key = encodeURIComponent(clientSecret(protocol, c.uuid, c.ssMethod))
	await http.attempt<void>([
		async () => {
			await http.call(`/panel/api/clients/del/${encodeURIComponent(c.email)}`, { method: "POST" })
		},
		async () => {
			for (const id of ids) await http.call(`/panel/api/inbounds/${id}/delClient/${key}`, { method: "POST" })
		},
	])
}

export async function resetClientTraffic(http: XuiHttpClient, inboundId: number, email: string): Promise<void> {
	await http.attempt([
		() => http.call(`/panel/api/clients/resetTraffic/${encodeURIComponent(email)}`, { method: "POST" }),
		() =>
			http.call(`/panel/api/inbounds/${inboundId}/resetClientTraffic/${encodeURIComponent(email)}`, {
				method: "POST",
			}),
	])
}

export async function fetchOnlineEmails(http: XuiHttpClient): Promise<string[]> {
	const list = await http.attempt<string[] | null>([
		() => http.call<string[] | null>("/panel/api/clients/onlines", { method: "POST" }),
		() => http.call<string[] | null>("/panel/api/inbounds/onlines", { method: "POST" }),
	])
	return Array.isArray(list) ? list.map(String) : []
}

/** Every share URL of one client across the inbounds it is attached to (v3 only). */
export async function fetchClientLinks(http: XuiHttpClient, email: string): Promise<string[]> {
	try {
		const list = await http.call<string[] | null>(`/panel/api/clients/links/${encodeURIComponent(email)}`, {
			method: "GET",
		})
		return Array.isArray(list) ? list.map(String) : []
	} catch (err) {
		if (err instanceof MissingEndpointError) return []
		throw err
	}
}

export async function fetchSubLinks(http: XuiHttpClient, subId: string): Promise<string[]> {
	try {
		const list = await http.call<string[] | null>(`/panel/api/clients/subLinks/${encodeURIComponent(subId)}`, {
			method: "GET",
		})
		return Array.isArray(list) ? list.map(String) : []
	} catch (err) {
		if (err instanceof MissingEndpointError) return []
		throw err
	}
}
