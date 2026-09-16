/**
 * Outbound e-mail + emailed login codes — no new dependency, no schema change.
 *
 * A tiny SMTP client speaks to the provider over implicit TLS (port 465, the port
 * Gmail / Zoho / Mailgun all accept), so nothing but `node:tls` is needed. Settings
 * live in the Setting table under `mail`, pending login codes under `login_codes`.
 */
import { randomInt } from "node:crypto"
import { connect as tlsConnect } from "node:tls"
import { prisma, type Admin } from "@srpanel/db"
import { z } from "zod"
import { verifyPassword } from "../security/password"
import { sha256 } from "../security/token"
import { AppError, ForbiddenError } from "../util/errors"
import { audit } from "./audit"
import { brandName, getSetting, panelUrl, setSetting } from "./settings"

/* ---------- settings ---------- */

export const mailSettingsSchema = z.object({
	enabled: z.boolean().default(false),
	host: z.string().trim().max(200).default(""),
	/** implicit TLS only — 465 for every common provider */
	port: z.number().int().min(1).max(65535).default(465),
	user: z.string().trim().max(200).default(""),
	pass: z.string().max(400).default(""),
	/** envelope sender; falls back to `user` */
	from: z.string().trim().max(200).default(""),
	fromName: z.string().trim().max(80).default(""),
	/** inbox that receives the login codes */
	to: z.string().trim().max(200).default(""),
	/** ask for an emailed code after the password at every login */
	loginCode: z.boolean().default(false),
	ttlMin: z.number().int().min(1).max(60).default(5),
})
export type MailSettings = z.infer<typeof mailSettingsSchema>

export const getMailSettings = () => getSetting("mail", mailSettingsSchema)

const loginCodesSchema = z.object({
	codes: z
		.record(
			z.object({
				hash: z.string().default(""),
				exp: z.number().default(0),
				tries: z.number().default(0),
			}),
		)
		.default({}),
})
type LoginCodes = z.infer<typeof loginCodesSchema>

/** never cached: a code is written and read seconds apart */
const getCodes = () => getSetting("login_codes", loginCodesSchema, 0)
const putCodes = (v: LoginCodes) => setSetting("login_codes", loginCodesSchema, v)

export const mailReady = (s: MailSettings): boolean => !!(s.enabled && s.host && (s.from || s.user))
export const loginCodeTarget = (s: MailSettings): string => s.to || s.from || s.user

export interface MailDto extends Omit<MailSettings, "pass"> {
	/** the password itself never leaves the server */
	hasPass: boolean
	ready: boolean
}

export function mailDto(s: MailSettings): MailDto {
	const { pass, ...rest } = s
	return { ...rest, hasPass: !!pass, ready: mailReady(s) }
}

export async function saveMailSettings(actor: Admin, input: Partial<MailSettings>): Promise<MailDto> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const current = await getMailSettings()
	// an empty password field means «keep the stored one»
	const next = mailSettingsSchema.parse({ ...current, ...input, pass: input.pass ? input.pass : current.pass })
	await setSetting("mail", mailSettingsSchema, next)
	await audit(actor.id, "mail.settings", actor.id, { host: next.host, port: next.port, enabled: next.enabled, loginCode: next.loginCode })
	return mailDto(next)
}

/* ---------- minimal SMTP client ---------- */

const b64 = (v: string) => Buffer.from(v, "utf8").toString("base64")
const headerValue = (v: string) => (/^[\x20-\x7E]*$/.test(v) ? v : "=?UTF-8?B?" + b64(v) + "?=")

/** Splits a finished SMTP reply (last line is «NNN …») off the buffer. */
function takeReply(buf: string): { reply: string; rest: string } | null {
	const lines = buf.split("\r\n")
	for (let i = 0; i < lines.length; i += 1) {
		if (/^\d{3} /.test(lines[i])) return { reply: lines.slice(0, i + 1).join("\n"), rest: lines.slice(i + 1).join("\r\n") }
	}
	return null
}

function buildMessage(s: MailSettings, to: string, subject: string, text: string): string {
	const sender = s.from || s.user
	const from = s.fromName ? headerValue(s.fromName) + " <" + sender + ">" : sender
	return [
		"From: " + from,
		"To: " + to,
		"Subject: " + headerValue(subject),
		"Date: " + new Date().toUTCString(),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"Content-Transfer-Encoding: base64",
		"",
		b64(text).replace(/(.{76})/g, "$1\r\n"),
	].join("\r\n")
}

/** Sends one message and resolves when the server accepted it. */
export async function sendMail(input: { to?: string; subject: string; text: string }): Promise<void> {
	const s = await getMailSettings()
	if (!mailReady(s)) throw new AppError("ارسال ایمیل هنوز تنطیم نشده است")
	const to = (input.to || loginCodeTarget(s)).trim()
	if (!to) throw new AppError("آدرس ایمیل مقصد خالی است")
	const socket = tlsConnect({ host: s.host, port: s.port, servername: s.host, rejectUnauthorized: false })
	socket.setEncoding("utf8")
	socket.setTimeout(20_000)
	let buffer = ""
	let failure: Error | null = null
	let waiting: { resolve: (v: string) => void; reject: (e: Error) => void } | null = null
	const settle = () => {
		if (!waiting) return
		if (failure) {
			const w = waiting
			waiting = null
			w.reject(failure)
			return
		}
		const got = takeReply(buffer)
		if (!got) return
		buffer = got.rest
		const w = waiting
		waiting = null
		w.resolve(got.reply)
	}
	const die = (message: string) => {
		failure = failure ?? new Error(message)
		settle()
	}
	socket.on("data", (chunk: string) => {
		buffer += chunk
		settle()
	})
	socket.on("error", (err: Error) => die(err.message))
	socket.on("timeout", () => {
		die("SMTP timeout")
		socket.destroy()
	})
	socket.on("close", () => die("SMTP connection closed"))

	const step = async (expected: number[], command?: string): Promise<string> => {
		if (command !== undefined) socket.write(command + "\r\n")
		const reply = await new Promise<string>((resolve, reject) => {
			waiting = { resolve, reject }
			settle()
		})
		const last = reply.split("\n").pop() ?? ""
		const code = Number(last.slice(0, 3))
		if (!expected.includes(code)) throw new AppError("SMTP: " + last.slice(0, 160))
		return reply
	}

	try {
		await step([220])
		await step([250], "EHLO " + (s.host || "srpanel"))
		if (s.user) {
			await step([334], "AUTH LOGIN")
			await step([334], b64(s.user))
			await step([235], b64(s.pass))
		}
		await step([250], "MAIL FROM:<" + (s.from || s.user) + ">")
		await step([250, 251], "RCPT TO:<" + to + ">")
		await step([354], "DATA")
		socket.write(buildMessage(s, to, input.subject, input.text) + "\r\n.\r\n")
		await step([250])
		await step([221], "QUIT").catch(() => "")
	} finally {
		socket.destroy()
	}
}

export async function sendTestMail(actor: Admin, to?: string): Promise<{ to: string }> {
	if (actor.role !== "OWNER") throw new ForbiddenError()
	const s = await getMailSettings()
	const target = (to || loginCodeTarget(s)).trim()
	const text = [brandName() + " — تست ارسال ایمیل", "", "اگر این پیام را می‌بینید، تنطیمات SMTP درست است.", panelUrl()].join("\n")
	await sendMail({ to: target, subject: brandName() + " test", text })
	await audit(actor.id, "mail.test", actor.id, { to: target })
	return { to: target }
}

/* ---------- emailed login codes ---------- */

const normUser = (v: string) => v.trim().toLowerCase().slice(0, 64)

function mask(address: string): string {
	const [name, domain] = address.split("@")
	if (!domain) return address
	const head = (name ?? "").slice(0, 2)
	return head + "***@" + domain
}

/** Is the emailed code part of the login flow right now? */
export async function loginCodeRequired(): Promise<boolean> {
	const s = await getMailSettings()
	return mailReady(s) && s.loginCode && !!loginCodeTarget(s)
}

/**
 * Password is checked first, so the endpoint cannot be used to spam the inbox
 * or to probe usernames. The code itself is only kept as a sha256 hash.
 */
export async function requestLoginCode(p: { username: string; password: string; ip?: string | null }): Promise<{ to: string; ttlMin: number }> {
	const s = await getMailSettings()
	if (!mailReady(s)) throw new AppError("ارسال ایمیل هنوز تنطیم نشده است")
	const target = loginCodeTarget(s)
	if (!target) throw new AppError("آدرس ایمیل دریافت کد تنطیم نشده است")
	const username = normUser(p.username)
	const admin = await prisma.admin.findUnique({ where: { username } })
	if (!admin || !verifyPassword(p.password, admin.passwordHash)) {
		await audit(null, "auth.login_failed", username, undefined, p.ip ?? null)
		throw new ForbiddenError("نام کاربری یا گذرواژه درست نیست")
	}
	if (!admin.isActive) throw new ForbiddenError("حساب غیرفعال است")
	const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
	const store = await getCodes()
	const fresh: LoginCodes = { codes: {} }
	for (const [key, value] of Object.entries(store.codes)) {
		if (value.exp > Date.now()) fresh.codes[key] = value
	}
	fresh.codes[username] = { hash: sha256(code), exp: Date.now() + s.ttlMin * 60_000, tries: 0 }
	await putCodes(fresh)
	const text = [
		brandName() + " — کد ورود",
		"",
		"کد: " + code,
		"اعتبار: " + s.ttlMin + " دقیقه",
		"کاربر: " + username,
		"IP: " + (p.ip || "-"),
		"",
		panelUrl(),
		"اگر شما درخواست ورود نداده‌اید، گذرواژه را عوض کنید.",
	].join("\n")
	await sendMail({ to: target, subject: brandName() + " login code", text })
	await audit(admin.id, "auth.email_code", username, { to: mask(target) }, p.ip ?? null)
	return { to: mask(target), ttlMin: s.ttlMin }
}

/** One shot: a wrong or expired code is dropped after 5 tries. */
export async function consumeLoginCode(usernameRaw: string, code: string): Promise<boolean> {
	const username = normUser(usernameRaw)
	const store = await getCodes()
	const row = store.codes[username]
	if (!row || !row.hash) return false
	const codes = { ...store.codes }
	if (row.exp < Date.now() || row.tries >= 5) {
		delete codes[username]
		await putCodes({ codes })
		return false
	}
	if (row.hash !== sha256(String(code).trim())) {
		codes[username] = { ...row, tries: row.tries + 1 }
		await putCodes({ codes })
		return false
	}
	delete codes[username]
	await putCodes({ codes })
	return true
}
