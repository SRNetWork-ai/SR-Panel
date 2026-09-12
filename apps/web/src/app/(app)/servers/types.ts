/* shared types for the servers screens */
export type AuthMode = "password" | "token"

export type FormState = {
	name: string
	baseUrl: string
	authMode: AuthMode
	apiToken: string
	username: string
	password: string
	totpSecret: string
	twoFactorCode: string
	insecureTls: boolean
	publicHost: string
	subBaseUrl: string
	weight: number
	isActive: boolean
}

export type InboundOption = {
	id: number
	remark: string
	protocol: string
	port: number
	enable: boolean
	tlsFlowCapable?: boolean
	ssMethod?: string
}

export type Caps = {
	clientsApi: boolean
	inboundOptions: boolean
	bearerAuth: boolean
	twoFactor: boolean
	panelVersion?: string
	xrayVersion?: string
}

export type TestResponse =
	| { ok?: false; error: string }
	| {
			ok: true
			baseUrl: string
			status: { xrayVersion?: string; panelVersion?: string; publicIp?: string }
			capabilities: Caps
			inbounds: InboundOption[]
	  }

export const emptyForm: FormState = {
	name: "",
	baseUrl: "",
	authMode: "token",
	apiToken: "",
	username: "",
	password: "",
	totpSecret: "",
	twoFactorCode: "",
	insecureTls: false,
	publicHost: "",
	subBaseUrl: "",
	weight: 100,
	isActive: true,
}

export type ServerFilter = "all" | "active" | "inactive" | "online" | "offline" | "error"
export type ServerSort = "name" | "weight" | "clients" | "inbounds"

/** panel-specific labels live next to the screen instead of the shared dictionary */
export const tr = (locale: string, fa: string, en: string) => (locale === "en" ? en : fa)
