/** Recursively converts BigInt -> number and Date -> ISO string so values can be JSON-serialized. */
export function jsonSafe<T>(value: T): any {
	if (value === null || value === undefined) return value
	if (typeof value === "bigint") return Number(value)
	if (value instanceof Date) return value.toISOString()
	if (Array.isArray(value)) return value.map(jsonSafe)
	if (typeof value === "object") {
		const out: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = jsonSafe(v)
		return out
	}
	return value
}
