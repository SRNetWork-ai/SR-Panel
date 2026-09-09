import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

function key(): Buffer {
	const secret = process.env.SRP_SECRET
	if (!secret || secret.length < 16) throw new Error("SRP_SECRET is missing or too short (min 16 chars)")
	return createHash("sha256").update(secret).digest()
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url) */
export function encryptSecret(plain: string): string {
	const iv = randomBytes(12)
	const cipher = createCipheriv("aes-256-gcm", key(), iv)
	const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
	return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`
}

export function decryptSecret(boxed: string): string {
	const [v, ivB, tagB, encB] = boxed.split(".")
	if (v !== "v1" || !ivB || !tagB || !encB) throw new Error("Malformed secret box")
	const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"))
	decipher.setAuthTag(Buffer.from(tagB, "base64url"))
	return Buffer.concat([decipher.update(Buffer.from(encB, "base64url")), decipher.final()]).toString("utf8")
}
