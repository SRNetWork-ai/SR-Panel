import type { PanelServerStatus } from "../types"
import type { XuiHttpClient } from "./http"

/** /panel/api/server/status moved between GET and POST across builds, so all three are tried. */
export async function fetchServerStatus(http: XuiHttpClient): Promise<PanelServerStatus> {
	const s = await http.attempt<any>([
		() => http.call<any>("/panel/api/server/status", { method: "GET" }),
		() => http.call<any>("/panel/api/server/status", { method: "POST" }),
		() => http.call<any>("/server/status", { method: "POST" }),
	])
	const version = s?.appVersion ?? s?.version ?? s?.panelVersion
	return {
		cpu: Number(s?.cpu ?? 0),
		memUsed: Number(s?.mem?.current ?? 0),
		memTotal: Number(s?.mem?.total ?? 0),
		diskUsed: Number(s?.disk?.current ?? 0),
		diskTotal: Number(s?.disk?.total ?? 0),
		uptime: Number(s?.uptime ?? 0),
		xrayState: String(s?.xray?.state ?? "unknown"),
		xrayVersion: s?.xray?.version ? String(s.xray.version) : undefined,
		netUp: Number(s?.netIO?.up ?? 0),
		netDown: Number(s?.netIO?.down ?? 0),
		totalSent: Number(s?.netTraffic?.sent ?? 0),
		totalRecv: Number(s?.netTraffic?.recv ?? 0),
		publicIp: s?.publicIP?.ipv4 ? String(s.publicIP.ipv4) : undefined,
		tcpCount: Number(s?.tcpCount ?? 0),
		udpCount: Number(s?.udpCount ?? 0),
		panelVersion: version ? String(version) : undefined,
	}
}
