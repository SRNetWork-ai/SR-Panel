import { createHash, randomBytes } from "node:crypto"

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url")
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")
export function shortId(len = 6): string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
	const bytes = randomBytes(len)
	let out = ""
	for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length]
	return out
}
