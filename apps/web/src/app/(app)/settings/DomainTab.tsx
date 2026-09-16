"use client"

import { useCallback, useEffect, useState } from "react"
import { Globe2, RefreshCw, ShieldCheck, Store, Trash2 } from "lucide-react"
import { api } from "@/lib/client"
import { useLocale, useT } from "@/lib/i18n"
import { Badge, Button, Field, Input, Spinner, useConfirm, useToast } from "@/components/ui"
import { Row, Section } from "@/components/parts"
import { CopyBtn } from "./atoms"
import { errMsg, tr } from "./types"

interface DomainStatus {
	host: string | null
	verified: boolean
	live: boolean
	token: string | null
	createdAt: string | null
	verifiedAt: string | null
	lastError: string | null
	checkUrl: string | null
	shopUrl: string | null
	panelHost: string
	slug: string | null
}

interface CheckResult {
	url: string
	ok: boolean
	status: number | null
	error: string | null
}

function when(iso: string | null | undefined): string {
	if (!iso) return "\u2014"
	const d = new Date(iso)
	return Number.isNaN(d.getTime()) ? "\u2014" : d.toLocaleString()
}

/** Per-admin custom shop domain: register, loop-back verify, drop. */
export function DomainTab() {
	const t = useT()
	const locale = useLocale()
	const L = (fa: string, en: string) => tr(locale, fa, en)
	const toast = useToast()
	const confirm = useConfirm()
	const [status, setStatus] = useState<DomainStatus | null>(null)
	const [host, setHost] = useState("")
	const [loading, setLoading] = useState(true)
	const [busy, setBusy] = useState<"save" | "verify" | "remove" | null>(null)
	const [blocked, setBlocked] = useState<string | null>(null)
	const [checks, setChecks] = useState<CheckResult[]>([])

	const load = useCallback(async () => {
		setLoading(true)
		try {
			const s = await api<DomainStatus>("/api/settings/domain")
			setStatus(s)
			setHost(s.host ?? "")
			setBlocked(null)
		} catch (err) {
			setBlocked(errMsg(err, tr(locale, "\u062f\u0631\u06cc\u0627\u0641\u062a \u0648\u0636\u0639\u06cc\u062a \u062f\u0627\u0645\u0646\u0647 \u0627\u0646\u062c\u0627\u0645 \u0646\u0634\u062f", "Could not load the domain status")))
		} finally {
			setLoading(false)
		}
	}, [locale])

	useEffect(() => {
		void load()
	}, [load])

	const save = async () => {
		setBusy("save")
		try {
			const s = await api<DomainStatus>("/api/settings/domain", { method: "PUT", json: { host: host.trim() } })
			setStatus(s)
			setHost(s.host ?? "")
			setChecks([])
			toast.ok(L("\u062f\u0627\u0645\u0646\u0647 \u062b\u0628\u062a \u0634\u062f\u061b \u062d\u0627\u0644\u0627 \u0622\u0646 \u0631\u0627 \u062a\u0623\u06cc\u06cc\u062f \u06a9\u0646\u06cc\u062f", "Domain saved \u2014 verify it now"))
		} catch (err) {
			toast.err(errMsg(err, L("\u062b\u0628\u062a \u062f\u0627\u0645\u0646\u0647 \u0627\u0646\u062c\u0627\u0645 \u0646\u0634\u062f", "Could not save the domain")))
		} finally {
			setBusy(null)
		}
	}

	const verify = async () => {
		setBusy("verify")
		try {
			const typed = host.trim().toLowerCase()
			if (typed && typed !== (status?.host ?? "")) await api<DomainStatus>("/api/settings/domain", { method: "PUT", json: { host: typed } })
			const res = await api<{ status: DomainStatus; checks: CheckResult[] }>("/api/settings/domain", { method: "POST", json: { action: "verify" } })
			setStatus(res.status)
			setChecks(res.checks)
			if (res.status.live) toast.ok(L("\u062f\u0627\u0645\u0646\u0647 \u062a\u0623\u06cc\u06cc\u062f \u0634\u062f \u0648 \u0641\u0631\u0648\u0634\u06af\u0627\u0647 \u0631\u0648\u06cc \u0622\u0646 \u0641\u0639\u0627\u0644 \u0627\u0633\u062a", "Domain verified \u2014 the shop is live on it"))
			else toast.err(res.status.lastError || L("\u062a\u0623\u06cc\u06cc\u062f \u062f\u0627\u0645\u0646\u0647 \u0627\u0646\u062c\u0627\u0645 \u0646\u0634\u062f", "Verification failed"))
		} catch (err) {
			toast.err(errMsg(err, L("\u0628\u0631\u0631\u0633\u06cc \u062f\u0627\u0645\u0646\u0647 \u0627\u0646\u062c\u0627\u0645 \u0646\u0634\u062f", "Could not run the check")))
		} finally {
			setBusy(null)
		}
	}

	const remove = async () => {
		if (!(await confirm(L("\u062f\u0627\u0645\u0646\u0647 \u0627\u062e\u062a\u0635\u0627\u0635\u06cc \u062d\u0630\u0641 \u0634\u0648\u062f\u061f \u0641\u0631\u0648\u0634\u06af\u0627\u0647 \u0628\u0647 \u0646\u0634\u0627\u0646\u06cc \u067e\u0646\u0644 \u0628\u0631\u0645\u06cc\u200c\u06af\u0631\u062f\u062f.", "Remove the custom domain? The shop goes back to the panel address.")))) return
		setBusy("remove")
		try {
			const s = await api<DomainStatus>("/api/settings/domain", { method: "DELETE" })
			setStatus(s)
			setHost("")
			setChecks([])
			toast.ok(t("set_saved"))
		} catch (err) {
			toast.err(errMsg(err, L("\u062d\u0630\u0641 \u062f\u0627\u0645\u0646\u0647 \u0627\u0646\u062c\u0627\u0645 \u0646\u0634\u062f", "Could not remove the domain")))
		} finally {
			setBusy(null)
		}
	}

	if (loading)
		return (
			<div className="glass grid h-40 place-items-center">
				<Spinner />
			</div>
		)

	if (blocked)
		return (
			<Section icon={Globe2} title={L("\u062f\u0627\u0645\u0646\u0647 \u0627\u062e\u062a\u0635\u0627\u0635\u06cc", "Custom domain")} subtitle={L("\u0627\u06cc\u0646 \u0642\u0627\u0628\u0644\u06cc\u062a \u067e\u0631\u0645\u06cc\u0648\u0645 \u0627\u0633\u062a", "This is a premium feature")}>
				<p className="text-sm text-danger">{blocked}</p>
				<Button className="mt-3" variant="ghost" onClick={() => void load()}>
					<RefreshCw className="h-4 w-4" />
					{t("refresh")}
				</Button>
			</Section>
		)

	const tone = status?.live ? "success" : status?.host ? "warning" : "muted"
	const state = status?.live ? L("\u0641\u0639\u0627\u0644", "Live") : status?.host ? L("\u062f\u0631 \u0627\u0646\u062a\u0638\u0627\u0631 \u062a\u0623\u06cc\u06cc\u062f", "Pending") : L("\u062b\u0628\u062a \u0646\u0634\u062f\u0647", "Not set")

	return (
		<div className="grid gap-4 xl:grid-cols-3">
			<Section
				className="xl:col-span-2"
				icon={Globe2}
				title={L("\u062f\u0627\u0645\u0646\u0647 \u0627\u062e\u062a\u0635\u0627\u0635\u06cc \u0641\u0631\u0648\u0634\u06af\u0627\u0647", "Custom shop domain")}
				subtitle={L("\u0641\u0631\u0648\u0634\u06af\u0627\u0647 \u0634\u0645\u0627 \u0631\u0648\u06cc \u062f\u0627\u0645\u0646\u0647 \u062e\u0648\u062f\u062a\u0627\u0646 \u0628\u0627\u0632 \u0645\u06cc\u200c\u0634\u0648\u062f", "Serve your shop on your own domain")}
				actions={<Badge tone={tone}>{state}</Badge>}
			>
				<div className="space-y-4">
					<Field label={L("\u062f\u0627\u0645\u0646\u0647", "Domain")} hint="shop.example.com">
						<Input className="mono" dir="ltr" value={host} onChange={(e) => setHost(e.target.value)} placeholder="shop.example.com" maxLength={190} />
					</Field>

					<div className="flex flex-wrap gap-2">
						<Button variant="primary" loading={busy === "save"} disabled={!host.trim() || busy !== null} onClick={() => void save()}>
							{t("save")}
						</Button>
						<Button variant="ghost" loading={busy === "verify"} disabled={!host.trim() || busy !== null} onClick={() => void verify()}>
							<ShieldCheck className="h-4 w-4" />
							{L("\u0628\u0631\u0631\u0633\u06cc \u0648 \u062a\u0623\u06cc\u06cc\u062f", "Check & verify")}
						</Button>
						<Button variant="ghost" loading={busy === "remove"} disabled={!status?.host || busy !== null} onClick={() => void remove()}>
							<Trash2 className="h-4 w-4" />
							{t("delete")}
						</Button>
						<Button variant="ghost" onClick={() => void load()}>
							<RefreshCw className="h-4 w-4" />
							{t("refresh")}
						</Button>
					</div>

					<ol className="space-y-1 text-[11px] text-muted">
						<li>{L("\u06f1) \u062f\u0631 DNS \u062f\u0627\u0645\u0646\u0647 \u06cc\u06a9 \u0631\u06a9\u0648\u0631\u062f A \u0628\u0633\u0627\u0632\u06cc\u062f \u06a9\u0647 \u0628\u0647 \u0647\u0645\u0627\u0646 \u0633\u0631\u0648\u0631 \u067e\u0646\u0644 \u0627\u0634\u0627\u0631\u0647 \u06a9\u0646\u062f.", "1) Point an A record of the domain at this panel server.")}</li>
						<li>{L("\u06f2) \u067e\u0633 \u0627\u0632 \u0627\u0646\u062a\u0634\u0627\u0631 DNS \u062f\u06a9\u0645\u0647 \u00ab\u0628\u0631\u0631\u0633\u06cc \u0648 \u062a\u0623\u06cc\u06cc\u062f\u00bb \u0631\u0627 \u0628\u0632\u0646\u06cc\u062f.", "2) Once DNS has propagated, press Check & verify.")}</li>
						<li>{L("\u06f3) \u0628\u0631\u0627\u06cc HTTPS \u0628\u0627\u06cc\u062f \u0631\u0648\u06cc \u0633\u0631\u0648\u0631 \u06af\u0648\u0627\u0647\u06cc SSL \u0647\u0645\u06cc\u0646 \u062f\u0627\u0645\u0646\u0647 \u062a\u0646\u0638\u06cc\u0645 \u0634\u0648\u062f (Nginx/Caddy).", "3) For HTTPS, issue an SSL certificate for this domain on the server (Nginx/Caddy).")}</li>
					</ol>

					{status?.lastError && !status.live ? <p className="text-[11px] text-danger">{status.lastError}</p> : null}

					{checks.length > 0 ? (
						<div className="glass-2 space-y-1 p-3 text-[11px]">
							{checks.map((c) => (
								<div key={c.url} className="flex items-center justify-between gap-2">
									<span className="mono truncate" dir="ltr">
										{c.url}
									</span>
									<span className={c.ok ? "text-success" : "text-danger"}>{c.ok ? L("\u062a\u0623\u06cc\u06cc\u062f \u0634\u062f", "OK") : c.error || L("\u0646\u0627\u0645\u0648\u0641\u0642", "Failed")}</span>
								</div>
							))}
						</div>
					) : null}
				</div>
			</Section>

			<Section
				icon={Store}
				title={L("\u0648\u0636\u0639\u06cc\u062a", "Status")}
				subtitle={L("\u0646\u0634\u0627\u0646\u06cc\u200c\u0647\u0627\u06cc\u06cc \u06a9\u0647 \u0645\u0634\u062a\u0631\u06cc \u0645\u06cc\u200c\u0628\u06cc\u0646\u062f", "What your customers hit")}
				actions={status?.shopUrl ? <CopyBtn value={status.shopUrl} label={L("\u06a9\u067e\u06cc \u0646\u0634\u0627\u0646\u06cc \u0641\u0631\u0648\u0634\u06af\u0627\u0647", "Copy shop URL")} /> : undefined}
			>
				<Row label={L("\u062f\u0627\u0645\u0646\u0647", "Domain")} mono>
					{status?.host || "\u2014"}
				</Row>
				<Row label={L("\u0648\u0636\u0639\u06cc\u062a", "State")}>{state}</Row>
				<Row label={L("\u0646\u0634\u0627\u0646\u06cc \u0641\u0631\u0648\u0634\u06af\u0627\u0647", "Shop URL")} mono>
					{status?.shopUrl || "\u2014"}
				</Row>
				<Row label={L("\u0631\u06a9\u0648\u0631\u062f A \u0628\u0647", "A record to")} mono>
					{status?.panelHost || "\u2014"}
				</Row>
				<Row label={L("\u0646\u0634\u0627\u0646\u06cc \u0628\u0631\u0631\u0633\u06cc", "Check URL")} mono>
					{status?.checkUrl || "\u2014"}
				</Row>
				<Row label={L("\u062a\u0623\u06cc\u06cc\u062f \u062f\u0631", "Verified at")} mono>
					{when(status?.verifiedAt)}
				</Row>
			</Section>
		</div>
	)
}
