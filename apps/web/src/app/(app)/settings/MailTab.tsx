"use client"

import { useEffect, useState } from "react"
import { Badge, Button, Card, Field, Input, Spinner, Switch, useToast } from "@/components/ui"
import { ApiError, api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"

type Mail = {
	enabled: boolean
	host: string
	port: number
	user: string
	from: string
	fromName: string
	to: string
	loginCode: boolean
	ttlMin: number
	hasPass: boolean
	ready: boolean
}

const digits = (v: string) => v.replace(/\D/g, "")

/** Owner-only: SMTP credentials plus the emailed login-code switch. */
export function MailTab() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	const toast = useToast()
	const [mail, setMail] = useState<Mail | null>(null)
	const [pass, setPass] = useState("")
	const [busy, setBusy] = useState(false)
	const [testing, setTesting] = useState(false)
	const msg = (e: unknown) => (e instanceof ApiError ? e.message : t("error_generic"))

	useEffect(() => {
		api<{ mail: Mail }>("/api/settings/mail")
			.then((r) => setMail(r.mail))
			.catch((e) => toast.err(msg(e)))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const patch = (v: Partial<Mail>) => setMail((m) => (m ? { ...m, ...v } : m))

	const save = async () => {
		if (!mail || busy) return
		setBusy(true)
		try {
			const r = await api<{ mail: Mail }>("/api/settings/mail", {
				method: "PUT",
				json: {
					enabled: mail.enabled,
					host: mail.host,
					port: mail.port,
					user: mail.user,
					pass: pass || undefined,
					from: mail.from,
					fromName: mail.fromName,
					to: mail.to,
					loginCode: mail.loginCode,
					ttlMin: mail.ttlMin,
				},
			})
			setMail(r.mail)
			setPass("")
			toast.ok(t("set_saved"))
		} catch (e) {
			toast.err(msg(e))
		} finally {
			setBusy(false)
		}
	}

	const sendTest = async () => {
		if (!mail || testing) return
		setTesting(true)
		try {
			const r = await api<{ to: string }>("/api/settings/mail", { method: "POST", json: { to: mail.to || undefined } })
			toast.ok(L("\u0627\u0631\u0633\u0627\u0644 \u0634\u062f \u0628\u0647 ", "Sent to ") + r.to)
		} catch (e) {
			toast.err(msg(e))
		} finally {
			setTesting(false)
		}
	}

	if (!mail)
		return (
			<Card title={L("\u0627\u06cc\u0645\u06cc\u0644 \u0648 \u06a9\u062f \u0648\u0631\u0648\u062f", "Email & login code")}>
				<div className="flex justify-center p-6">
					<Spinner />
				</div>
			</Card>
		)

	return (
		<div className="space-y-6">
			<Card
				title={L("\u0627\u06cc\u0645\u06cc\u0644 (SMTP)", "Email (SMTP)")}
				subtitle={L("\u0627\u0631\u0633\u0627\u0644 \u0628\u0627 TLS \u0645\u0633\u062a\u0642\u06cc\u0645 \u0631\u0648\u06cc \u067e\u0648\u0631\u062a 465", "Implicit TLS on port 465")}
				actions={<Badge tone={mail.ready ? "success" : "warning"}>{mail.ready ? L("\u0622\u0645\u0627\u062f\u0647", "Ready") : L("\u062a\u0646\u0638\u06cc\u0645 \u0646\u0634\u062f\u0647", "Not configured")}</Badge>}
			>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label={L("\u0633\u0631\u0648\u0631 SMTP", "SMTP host")} hint="smtp.gmail.com">
						<Input dir="ltr" value={mail.host} onChange={(e) => patch({ host: e.target.value })} />
					</Field>
					<Field label={L("\u067e\u0648\u0631\u062a", "Port")} hint="465">
						<Input dir="ltr" inputMode="numeric" value={String(mail.port)} onChange={(e) => patch({ port: Number(digits(e.target.value)) || 465 })} />
					</Field>
					<Field label={L("\u0646\u0627\u0645 \u06a9\u0627\u0631\u0628\u0631\u06cc", "Username")} hint="user@gmail.com">
						<Input dir="ltr" value={mail.user} onChange={(e) => patch({ user: e.target.value })} />
					</Field>
					<Field
						label={L("\u06af\u0630\u0631\u0648\u0627\u0698\u0647", "Password")}
						hint={mail.hasPass ? L("\u062e\u0627\u0644\u06cc = \u0628\u062f\u0648\u0646 \u062a\u063a\u06cc\u06cc\u0631", "Blank keeps the stored one") : "App password"}
					>
						<Input dir="ltr" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={mail.hasPass ? "********" : ""} />
					</Field>
					<Field label={L("\u0622\u062f\u0631\u0633 \u0641\u0631\u0633\u062a\u0646\u062f\u0647", "From address")} hint={L("\u062e\u0627\u0644\u06cc = \u0646\u0627\u0645 \u06a9\u0627\u0631\u0628\u0631\u06cc", "Blank = username")}>
						<Input dir="ltr" value={mail.from} onChange={(e) => patch({ from: e.target.value })} />
					</Field>
					<Field label={L("\u0646\u0627\u0645 \u0641\u0631\u0633\u062a\u0646\u062f\u0647", "From name")}>
						<Input dir="ltr" value={mail.fromName} onChange={(e) => patch({ fromName: e.target.value })} />
					</Field>
				</div>
				<div className="mt-4 flex flex-wrap items-center gap-3">
					<Switch checked={mail.enabled} onChange={() => patch({ enabled: !mail.enabled })} label={L("\u0627\u0631\u0633\u0627\u0644 \u0627\u06cc\u0645\u06cc\u0644 \u0641\u0639\u0627\u0644", "Email enabled")} />
					<div className="flex-1" />
					<Button size="sm" onClick={sendTest} loading={testing}>
						{L("\u0627\u0631\u0633\u0627\u0644 \u0627\u06cc\u0645\u06cc\u0644 \u062a\u0633\u062a", "Send test email")}
					</Button>
					<Button onClick={save} loading={busy}>
						{t("save")}
					</Button>
				</div>
			</Card>

			<Card
				title={L("\u06a9\u062f \u0648\u0631\u0648\u062f \u0627\u06cc\u0645\u06cc\u0644\u06cc", "Emailed login code")}
				subtitle={L("\u06a9\u062f \u06f6 \u0631\u0642\u0645\u06cc \u067e\u0633 \u0627\u0632 \u06af\u0630\u0631\u0648\u0627\u0698\u0647", "A 6-digit code after the password")}
			>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label={L("\u0627\u06cc\u0645\u06cc\u0644 \u062f\u0631\u06cc\u0627\u0641\u062a \u06a9\u062f", "Code inbox")} hint={L("\u062e\u0627\u0644\u06cc = \u0622\u062f\u0631\u0633 \u0641\u0631\u0633\u062a\u0646\u062f\u0647", "Blank = from address")}>
						<Input dir="ltr" value={mail.to} onChange={(e) => patch({ to: e.target.value })} />
					</Field>
					<Field label={L("\u0627\u0639\u062a\u0628\u0627\u0631 \u06a9\u062f (\u062f\u0642\u06cc\u0642\u0647)", "Code lifetime (minutes)")} hint="1 - 60">
						<Input
							dir="ltr"
							inputMode="numeric"
							value={String(mail.ttlMin)}
							onChange={(e) => patch({ ttlMin: Math.min(60, Math.max(1, Number(digits(e.target.value)) || 5)) })}
						/>
					</Field>
				</div>
				<div className="mt-4 space-y-3">
					<Switch
						checked={mail.loginCode}
						onChange={() => patch({ loginCode: !mail.loginCode })}
						label={L("\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u06a9\u062f \u062f\u0631 \u0647\u0631 \u0648\u0631\u0648\u062f", "Ask for the code at every login")}
					/>
					<p className="text-xs text-muted">
						{L("\u062a\u0627 \u0648\u0642\u062a\u06cc \u0627\u06cc\u0645\u06cc\u0644 \u062a\u0633\u062a \u0645\u0648\u0641\u0642 \u0646\u0634\u062f\u0647\u060c \u0627\u06cc\u0646 \u0631\u0627 \u0631\u0648\u0634\u0646 \u0646\u06a9\u0646.", "Do not enable this before a test email succeeds.")}
					</p>
					<Button onClick={save} loading={busy}>
						{t("save")}
					</Button>
				</div>
			</Card>
		</div>
	)
}
