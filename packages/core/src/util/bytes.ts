export const GB = 1024 ** 3
export const gbToBytes = (gb: number) => Math.round(gb * GB)
export const bytesToGb = (b: number | bigint, digits = 2) => Number((Number(b) / GB).toFixed(digits))
export function formatBytes(b: number | bigint, digits = 1): string {
	const n = Number(b)
	if (!Number.isFinite(n) || n <= 0) return "0 B"
	const units = ["B", "KB", "MB", "GB", "TB", "PB"]
	const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
	return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : digits)} ${units[i]}`
}
export const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000)
export const DAY_MS = 86_400_000
