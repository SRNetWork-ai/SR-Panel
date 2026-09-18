/**
 * Node fetch has no per-request TLS switch, so panels with self-signed certificates are
 * handled by flipping the process flag for the duration of the call (ref-counted).
 */
let insecureDepth = 0
let insecurePrev: string | undefined

export async function withTls<T>(insecure: boolean | undefined, fn: () => Promise<T>): Promise<T> {
	if (!insecure) return fn()
	if (insecureDepth === 0) {
		insecurePrev = process.env.NODE_TLS_REJECT_UNAUTHORIZED
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
	}
	insecureDepth++
	try {
		return await fn()
	} finally {
		insecureDepth--
		if (insecureDepth === 0) {
			if (insecurePrev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
			else process.env.NODE_TLS_REJECT_UNAUTHORIZED = insecurePrev
		}
	}
}
