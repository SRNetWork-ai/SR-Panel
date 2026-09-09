export type InboundProtocol = "vless" | "vmess" | "trojan" | "shadowsocks" | (string & {})

export interface PanelClientStat {
	email: string
	up: number
	down: number
	total: number
	expiryTime: number
	enable: boolean
	inboundId: number
	reset?: number
}

export interface PanelInbound {
	id: number
	remark: string
	port: number
	protocol: InboundProtocol
	enable: boolean
	tag: string
	listen: string
	up: number
	down: number
	total: number
	expiryTime: number
	/** Parsed `settings` JSON of the inbound (clients, decryption, method, ...) */
	settings: Record<string, any>
	/** Parsed `streamSettings` JSON (network, security, tls/reality, ws/grpc/...) */
	streamSettings: Record<string, any>
	clientStats: PanelClientStat[]
}

export interface PanelServerStatus {
	cpu: number
	memUsed: number
	memTotal: number
	diskUsed?: number
	diskTotal?: number
	uptime: number
	xrayState: string
	xrayVersion?: string
	netUp?: number
	netDown?: number
	totalSent?: number
	totalRecv?: number
	publicIp?: string
	tcpCount?: number
	udpCount?: number
}

export interface ProvisionClientInput {
	/** Stable client UUID (VLESS/VMess id, Trojan/SS password) */
	uuid: string
	/** Unique-per-panel email/remark */
	email: string
	/** Traffic limit in bytes (0 = unlimited) */
	totalBytes: number
	/** Expiry as epoch milliseconds (0 = never) */
	expiryTimeMs: number
	limitIp: number
	enable: boolean
	subId: string
	flow?: string
	tgId?: string
}

export interface PanelConnection {
	baseUrl: string
	username: string
	password: string
}

/** Every supported panel core implements this. v1 ships the 3x-ui adapter. */
export interface PanelAdapter {
	login(): Promise<void>
	getStatus(): Promise<PanelServerStatus>
	listInbounds(): Promise<PanelInbound[]>
	addClient(inboundId: number, protocol: InboundProtocol, client: ProvisionClientInput): Promise<void>
	updateClient(inboundId: number, protocol: InboundProtocol, client: ProvisionClientInput): Promise<void>
	deleteClient(inboundId: number, protocol: InboundProtocol, client: { uuid: string; email: string }): Promise<void>
	resetClientTraffic(inboundId: number, email: string): Promise<void>
	getOnlineEmails(): Promise<string[]>
}
