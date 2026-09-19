import type {
	InboundProtocol,
	PanelAdapter,
	PanelCapabilities,
	PanelConnection,
	PanelInbound,
	PanelInboundOption,
	PanelServerStatus,
	ProvisionClientInput,
} from "../types"
import {
	addClient as addPanelClient,
	deleteClient as deletePanelClient,
	fetchClientIps,
	fetchClientLinks,
	fetchOnlineEmails,
	fetchSubLinks,
	resetClientTraffic as resetPanelClientTraffic,
	updateClient as updatePanelClient,
	wipeClientIps,
} from "./clients"
import { MissingEndpointError } from "./errors"
import { XuiHttpClient } from "./http"
import { fetchInboundOptions, fetchInbounds } from "./inbounds"
import { fetchServerStatus } from "./server"

/**
 * 3X-UI adapter (MHSanaei). Speaks the v3 API - Bearer API tokens, first-class
 * /panel/api/clients/* endpoints and /panel/api/inbounds/options - and transparently
 * falls back to the legacy /panel/api/inbounds/* routes on older 2.x builds.
 *
 * This file only wires the pieces together: `http.ts` owns the transport and auth,
 * while `server.ts`, `inbounds.ts` and `clients.ts` own the route mapping.
 */
export class XuiAdapter implements PanelAdapter {
	private readonly http: XuiHttpClient
	private caps: PanelCapabilities | null = null
	readonly baseUrl: string

	constructor(conn: PanelConnection, timeoutMs?: number) {
		this.http = new XuiHttpClient(conn, timeoutMs)
		this.baseUrl = this.http.baseUrl
	}

	login(): Promise<void> {
		return this.http.login()
	}

	/** Detects what this panel build supports; cached for the lifetime of the adapter. */
	async probe(): Promise<PanelCapabilities> {
		if (this.caps) return this.caps
		await this.http.ensureSession()
		let inboundOptions = false
		let clientsApi = false
		try {
			await this.http.call<any[]>("/panel/api/inbounds/options", { method: "GET" })
			inboundOptions = true
		} catch (err) {
			if (!(err instanceof MissingEndpointError)) throw err
		}
		try {
			await this.http.call<any>("/panel/api/clients/groups", { method: "GET" })
			clientsApi = true
		} catch (err) {
			if (!(err instanceof MissingEndpointError)) throw err
		}
		const status = await this.getStatus().catch(() => null)
		this.caps = {
			clientsApi,
			inboundOptions,
			bearerAuth: this.http.usesToken,
			twoFactor: await this.http.twoFactorEnabled(),
			panelVersion: status?.panelVersion,
			xrayVersion: status?.xrayVersion,
		}
		return this.caps
	}

	getStatus(): Promise<PanelServerStatus> {
		return fetchServerStatus(this.http)
	}

	listInbounds(): Promise<PanelInbound[]> {
		return fetchInbounds(this.http)
	}

	listInboundOptions(): Promise<PanelInboundOption[]> {
		return fetchInboundOptions(this.http)
	}

	addClient(inboundIds: number | number[], protocol: InboundProtocol, c: ProvisionClientInput): Promise<void> {
		return addPanelClient(this.http, inboundIds, protocol, c)
	}

	updateClient(inboundIds: number | number[], protocol: InboundProtocol, c: ProvisionClientInput): Promise<void> {
		return updatePanelClient(this.http, inboundIds, protocol, c)
	}

	deleteClient(
		inboundIds: number | number[],
		protocol: InboundProtocol,
		c: { uuid: string; email: string; ssMethod?: string },
	): Promise<void> {
		return deletePanelClient(this.http, inboundIds, protocol, c)
	}

	resetClientTraffic(inboundId: number, email: string): Promise<void> {
		return resetPanelClientTraffic(this.http, inboundId, email)
	}

	getOnlineEmails(): Promise<string[]> {
		return fetchOnlineEmails(this.http)
	}

	getClientIps(email: string): Promise<string[]> {
		return fetchClientIps(this.http, email)
	}

	clearClientIps(email: string): Promise<void> {
		return wipeClientIps(this.http, email)
	}

	getClientLinks(email: string): Promise<string[]> {
		return fetchClientLinks(this.http, email)
	}

	getSubLinks(subId: string): Promise<string[]> {
		return fetchSubLinks(this.http, subId)
	}
}
