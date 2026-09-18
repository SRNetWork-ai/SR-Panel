import { PanelError } from "../../util/errors"

/** Raised when a route is missing on this panel build, so the caller can fall back to the legacy one. */
export class MissingEndpointError extends PanelError {
	constructor(path: string) {
		super(`endpoint not available: ${path}`)
		this.name = "MissingEndpointError"
	}
}
