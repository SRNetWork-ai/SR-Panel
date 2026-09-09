import { createHmac, randomBytes } from "node:crypto"

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function base32Encode(buf: Buffer): string {
	let bits = 0, value = 0, out = ""
	for (const byte of buf) {
		value = ((value << 8) | byte) & 0xffff
		bits += 8
		while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5 }
	}
	if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
	return out
}

export function base32Decode(str: string): Buffer {
	const clean = str.toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, "")
	let bits = 0, value = 0
	const out: number[] = []
	for (const ch of clean) {
		value = ((value << 5) | ALPHABET.indexOf(ch)) & 0xffff
		bits += 5
		if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
	}
	return Buffer.from(out)
}

export const generateTotpSecret = () => base32Encode(randomBytes(20))

export function totpCode(secret: string, offsetSteps = 0, step = 30, digits = 6): string {
	const counter = Math.floor(Date.now() / 1000 / step) + offsetSteps
	const msg = Buffer.alloc(8)
	msg.writeBigUInt64BE(BigInt(counter))
	const h = createHmac("sha1", base32Decode(secret)).update(msg).digest()
	const o = h[h.length - 1]! & 0xf
	const code = (((h[o]! & 0x7f) << 24) | ((h[o + 1]! & 0xff) << 16) | ((h[o + 2]! & 0xff) << 8) | (h[o + 3]! & 0xff)) % 10 ** digits
	return code.toString().padStart(digits, "0")
}

export function verifyTotp(secret: string, code: string, window = 1): boolean {
	const clean = code.replace(/\D/g, "")
	if (clean.length !== 6) return false
	for (let w = -window; w <= window; w++) if (totpCode(secret, w) === clean) return true
	return false
}

export const otpauthUrl = (issuer: string, account: string, secret: string) =>
	`otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
