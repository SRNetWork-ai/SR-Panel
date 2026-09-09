import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

const PARAMS = { N: 16384, r: 8, p: 1 }

export function hashPassword(password: string): string {
	const salt = randomBytes(16)
	const hash = scryptSync(password, salt, 64, PARAMS)
	return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`
}

export function verifyPassword(password: string, stored: string): boolean {
	const [algo, saltB, hashB] = stored.split("$")
	if (algo !== "scrypt" || !saltB || !hashB) return false
	const expected = Buffer.from(hashB, "base64url")
	const actual = scryptSync(password, Buffer.from(saltB, "base64url"), expected.length, PARAMS)
	return actual.length === expected.length && timingSafeEqual(actual, expected)
}
