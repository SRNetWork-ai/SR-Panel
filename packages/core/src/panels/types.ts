export type InboundProtocol = "vless" | "vmess" | "trojan" | "shadowsocks" | (string & {})

/** How SRPanel authenticates against the remote panel. 3X-UI v3 supports both. */
export type PanelAuthMode = "password" | "token"

export interface PanelClientStat {
	email: string
	up: number
	down: number
	total: number
	expiryTime: number
	enable: boolean
	inboundId: number
	reset?: number
	lastOnline?: number
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
	/** Parsed `settings` (clients, decryption, method, ...) - v3 already returns an object */
	settings: Record<string, any>
	/** Parsed `streamSettings` (network, security, tls/reality, ws/grpc/...) */
	streamSettings: Record<string, any>
	clientStats: PanelClientStat[]
	/** Remote node that hosts this inbound (v3 multi-node panels) */
	nodeId?: number
	/** Address of the node hosting this inbound - merged in from /inbounds/options */
	nodeAddress?: string
	/** Address the panel itself puts into share links for this inbound (wins over the panel domain) */
	shareAddr?: string
}

/** Lightweight picker projection returned by GET /panel/api/inbounds/options (3X-UI v3). */
export interface PanelInboundOption {
	id: number
	remark: string
	tag: string
	protocol: InboundProtocol
	port: number
	listen?: string
	enable: boolean
	/** VLESS on TCP+TLS/Reality (or XHTTP with VLESS encryption): the client may carry a flow */
	tlsFlowCapable: boolean
	/** Shadowsocks cipher - empty for other protocols, needed to mint a valid SS2022 PSK */
	ssMethod: string
	nodeId?: number
	nodeAddress?: string
	shareAddr?: string
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
	/** 3X-UI panel version reported by /panel/api/server/status */
	panelVersion?: string
}

export interface ProvisionClientInput {
	/** Stable client UUID (VLESS/VMess id, Trojan password seed) */
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
	/** Shadowsocks cipher of the target inbound, from /inbounds/options */
	ssMethod?: string
	/** Device (HWID) limit - v3 only, ignored by older panels */
	limitHwid?: number
	/** Optional group label shown on the panel client list (v3) */
	group?: string
	comment?: string
}

export interface PanelConnection {
	/** Origin + webBasePath, e.g. https://1.2.3.4:2053/BoezMVwcHtkqAEz1NW */
	baseUrl: string
	authMode?: PanelAuthMode
	username?: string
	password?: string
	/** Settings -> Security -> API Token (full-admin Bearer credential) */
	apiToken?: string
	/** TOTP secret of the panel account so we can answer 2FA at login */
	totpSecret?: string
	/** One-off 2FA code (used by the connection test before the secret is stored) */
	twoFactorCode?: string
	/** Accept self-signed panel certificates */
	insecureTls?: boolean
	timeoutMs?: number
}

/** What the remote panel build actually supports - detected once per connection test/sync. */
export interface PanelCapabilities {
	/** First-class /panel/api/clients/* endpoints (3X-UI v3) */
	clientsApi: boolean
	/** GET /panel/api/inbounds/options picker projection */
	inboundOptions: boolean
	/** Authenticated with a Bearer API token instead of a session cookie */
	bearerAuth: boolean
	/** Panel has two-factor authentication enabled */
	twoFactor: boolean
	panelVersion?: string
	xrayVersion?: string
}

/** Every supported panel core implements this. v1 ships the 3x-ui / 3X-UI v3 adapter. */
export interface PanelAdapter {
	login(): Promise<void>
	probe(): Promise<PanelCapabilities>
	getStatus(): Promise<PanelServerStatus>
	listInbounds(): Promise<PanelInbound[]>
	listInboundOptions(): Promise<PanelInboundOption[]>
	/** One client may be attached to several inbounds of the same panel (3X-UI v3). */
	addClient(inboundIds: number | number[], protocol: InboundProtocol, client: ProvisionClientInput): Promise<void>
	/** The id list is the client's inbound membership - always send every inbound it must stay on. */
	updateClient(inboundIds: number | number[], protocol: InboundProtocol, client: ProvisionClientInput): Promise<void>
	deleteClient(inboundIds: number | number[], protocol: InboundProtocol, client: { uuid: string; email: string }): Promise<void>
	resetClientTraffic(inboundId: number, email: string): Promise<void>
	getOnlineEmails(): Promise<string[]>
	getClientLinks(email: string): Promise<string[]>
	getSubLinks(subId: string): Promise<string[]>
}
