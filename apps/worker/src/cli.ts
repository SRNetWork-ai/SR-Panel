/**
 * SRPanel maintenance CLI - runs inside the container:
 *   docker compose run --rm --no-deps -T worker npx tsx apps/worker/src/cli.ts <command> [args]
 *
 * Commands:
 *   info                                  counts of admins / servers / clients / orders
 *   admins                                list admin accounts
 *   reset-password <username> <password>  set a new password (creates the OWNER if no admin exists yet)
 *   disable-2fa <username>                turn off TOTP for an account
 *   unlock <username>                     re-activate a disabled account
 */
import { prisma } from "@srpanel/db"
import { hashPassword } from "@srpanel/core"

function out(o: unknown) {
	console.log(typeof o === "string" ? o : JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2))
}

function fail(msg: string, code = 1): never {
	console.error(`ERROR: ${msg}`)
	process.exit(code)
}

const norm = (s?: string) => (s ?? "").trim().toLowerCase()

async function info() {
	const [admins, servers, clients, orders] = await Promise.all([
		prisma.admin.count(),
		prisma.server.count(),
		prisma.client.count(),
		prisma.order.count().catch(() => 0),
	])
	out({ admins, servers, clients, orders })
}

async function admins() {
	const rows = await prisma.admin.findMany({
		orderBy: { createdAt: "asc" },
		select: { username: true, role: true, isActive: true, totpEnabled: true, lastLoginAt: true },
	})
	if (!rows.length) {
		out("no admin accounts yet - run: reset-password <username> <password>")
		return
	}
	const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n)
	out(pad("USERNAME", 22) + pad("ROLE", 10) + pad("ACTIVE", 8) + pad("2FA", 6) + "LAST LOGIN")
	for (const r of rows) {
		out(
			pad(r.username, 22) +
				pad(r.role, 10) +
				pad(r.isActive ? "yes" : "no", 8) +
				pad(r.totpEnabled ? "on" : "off", 6) +
				(r.lastLoginAt ? r.lastLoginAt.toISOString() : "-"),
		)
	}
}

async function resetPassword(usernameRaw?: string, password?: string) {
	const username = norm(usernameRaw)
	if (!username) fail("usage: reset-password <username> <password>")
	if (!password || password.length < 6) fail("password must be at least 6 characters")
	const passwordHash = await hashPassword(password!)
	const existing = await prisma.admin.findUnique({ where: { username } })
	if (existing) {
		await prisma.$transaction([
			prisma.admin.update({ where: { id: existing.id }, data: { passwordHash, isActive: true } }),
			prisma.session.deleteMany({ where: { adminId: existing.id } }),
		])
		out(`password updated for "${username}" (${existing.role}); all sessions revoked`)
		return
	}
	const count = await prisma.admin.count()
	if (count > 0) fail(`admin "${username}" not found - use "admins" to list accounts`)
	await prisma.admin.create({
		data: { username, passwordHash, role: "OWNER", displayName: "Owner", isActive: true },
	})
	out(`OWNER account "${username}" created`)
}

async function disable2fa(usernameRaw?: string) {
	const username = norm(usernameRaw)
	if (!username) fail("usage: disable-2fa <username>")
	const existing = await prisma.admin.findUnique({ where: { username } })
	if (!existing) fail(`admin "${username}" not found`)
	await prisma.admin.update({ where: { id: existing!.id }, data: { totpEnabled: false, totpSecret: null } })
	out(`2FA disabled for "${username}"`)
}

async function unlock(usernameRaw?: string) {
	const username = norm(usernameRaw)
	if (!username) fail("usage: unlock <username>")
	const existing = await prisma.admin.findUnique({ where: { username } })
	if (!existing) fail(`admin "${username}" not found`)
	await prisma.admin.update({ where: { id: existing!.id }, data: { isActive: true } })
	out(`account "${username}" is active`)
}

async function main() {
	const [cmd, ...args] = process.argv.slice(2)
	switch (cmd) {
		case "info":
			return info()
		case "admins":
			return admins()
		case "reset-password":
			return resetPassword(args[0], args[1])
		case "disable-2fa":
			return disable2fa(args[0])
		case "unlock":
			return unlock(args[0])
		default:
			out("usage: cli.ts <info | admins | reset-password <user> <pass> | disable-2fa <user> | unlock <user>>")
			process.exit(cmd ? 2 : 0)
	}
}

main()
	.catch((e) => {
		console.error("ERROR:", e instanceof Error ? e.message : e)
		process.exitCode = 1
	})
	.finally(async () => {
		await prisma.$disconnect().catch(() => undefined)
	})
