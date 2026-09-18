import type { InboundProtocol, PanelClientStat, PanelInbound, PanelInboundOption } from "../types"
import { parseJsonField } from "./encoding"
import { MissingEndpointError } from "./errors"
import type { XuiHttpClient } from "./http"

export async function fetchInbounds(http: XuiHttpClient): Promise<PanelInbound[]> {
	const list = (await http.call<any[]>("/panel/api/inbounds/list", { method: "GET" })) ?? []
	return list.map((ib) => ({
		id: Number(ib.id),
		remark: String(ib.remark ?? ""),
		port: Number(ib.port),
		protocol: String(ib.protocol ?? "vless") as InboundProtocol,
		enable: Boolean(ib.enable),
		tag: String(ib.tag ?? ""),
		listen: String(ib.listen ?? ""),
		up: Number(ib.up ?? 0),
		down: Number(ib.down ?? 0),
		total: Number(ib.total ?? 0),
		expiryTime: Number(ib.expiryTime ?? 0),
		settings: parseJsonField(ib.settings),
		streamSettings: parseJsonField(ib.streamSettings),
		nodeId: ib.nodeId != null ? Number(ib.nodeId) : undefined,
		clientStats: Array.isArray(ib.clientStats)
			? ib.clientStats.map(
					(c: any): PanelClientStat => ({
						email: String(c.email ?? ""),
						up: Number(c.up ?? 0),
						down: Number(c.down ?? 0),
						total: Number(c.total ?? 0),
						expiryTime: Number(c.expiryTime ?? 0),
						enable: Boolean(c.enable),
						inboundId: Number(c.inboundId ?? ib.id),
						reset: Number(c.reset ?? 0),
						lastOnline: c.lastOnline != null ? Number(c.lastOnline) : undefined,
					}),
				)
			: [],
	}))
}

/** Picker projection used by the "add panel" flow - cheap even on panels with 10k clients. */
export async function fetchInboundOptions(http: XuiHttpClient): Promise<PanelInboundOption[]> {
	try {
		const list = (await http.call<any[]>("/panel/api/inbounds/options", { method: "GET" })) ?? []
		return list.map((o) => ({
			id: Number(o.id),
			remark: String(o.remark ?? ""),
			tag: String(o.tag ?? ""),
			protocol: String(o.protocol ?? "vless") as InboundProtocol,
			port: Number(o.port ?? 0),
			listen: o.listen ? String(o.listen) : undefined,
			enable: o.enable !== false,
			tlsFlowCapable: Boolean(o.tlsFlowCapable),
			ssMethod: String(o.ssMethod ?? ""),
			nodeId: o.nodeId != null ? Number(o.nodeId) : undefined,
			nodeAddress: o.nodeAddress ? String(o.nodeAddress) : undefined,
			shareAddr: o.shareAddr ? String(o.shareAddr) : undefined,
		}))
	} catch (err) {
		if (!(err instanceof MissingEndpointError)) throw err
		return (await fetchInbounds(http)).map((i) => {
			const network = String(i.streamSettings?.network ?? "tcp")
			const security = String(i.streamSettings?.security ?? "none")
			return {
				id: i.id,
				remark: i.remark,
				tag: i.tag,
				protocol: i.protocol,
				port: i.port,
				listen: i.listen || undefined,
				enable: i.enable,
				tlsFlowCapable:
					i.protocol === "vless" && network === "tcp" && (security === "tls" || security === "reality"),
				ssMethod: i.protocol === "shadowsocks" ? String(i.settings?.method ?? "") : "",
			}
		})
	}
}
