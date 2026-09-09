import { prisma } from "@srpanel/db"
import { hashPassword } from "../security/password"

let ensured = false

/** Creates the OWNER account from env on first run. Safe to call often. */
export async function ensureOwner(): Promise<void> {
	if (ensured) return
	const count = await prisma.admin.count()
	if (count === 0) {
		const username = (process.env.SRP_OWNER_USERNAME || "admin").trim().toLowerCase()
		const password = process.env.SRP_OWNER_PASSWORD || "admin"
		await prisma.admin.create({
			data: { username, passwordHash: hashPassword(password), role: "OWNER", displayName: "Owner" },
		})
		console.log(`[srpanel] owner account created: ${username}`)
	}
	ensured = true
}
