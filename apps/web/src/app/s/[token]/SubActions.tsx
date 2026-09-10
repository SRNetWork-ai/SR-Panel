"use client"

import { useState } from "react"
import { Check, Copy, ExternalLink, LifeBuoy, QrCode, Send, Smartphone } from "lucide-react"
import { copyText } from "@/lib/client"
import { QR } from "@/components/QR"

type Link = { server: string; remark: string; uri: string }

const APPS = [
	{ name: "v2rayNG", os: "Android", href: (u: string) => `v2rayng://install-sub?url=${encodeURIComponent(u)}&name=SRPanel`, store: "https://github.com/2dust/v2rayNG/releases" },
	{ name: "Hiddify", os: "Android / iOS / Windows / macOS", href: (u: string) => `hiddify://import/${u}`, store: "https://hiddify.com" },
	{ name: "Streisand", os: "iOS", href: (u: string) => `streisand://import/${u}`, store: "https://apps.apple.com/app/streisand/id6450534064" },
	{ name: "Shadowrocket", os: "iOS", href: (u: string) => `shadowrocket://add/sub://${btoa(u)}`, store: "https://apps.apple.com/app/shadowrocket/id932747118" },
	{ name: "NekoBox / Nekoray", os: "Android / Windows / Linux", href: (u: string) => `sn://subscription?url=${encodeURIComponent(u)}&name=SRPanel`, store: "https://github.com/MatsuriDayo/NekoBoxForAndroid/releases" },
	{ name: "v2rayN", os: "Windows", href: (u: string) => u, store: "https://github.com/2dust/v2rayN/releases" },
]

export function SubActions({ subUrl, links, brandName, supportUrl, telegramUrl }: { subUrl: string; links: Link[]; brandName: string; supportUrl: string | null; telegramUrl: string | null }) {
	const [copied, setCopied] = useState<string | null>(null)
	const [qr, setQr] = useState<string | null>(null)
	const [showLinks, setShowLinks] = useState(false)

	const copy = async (key: string, text: string) => {
		if (await copyText(text)) {
			setCopied(key)
			setTimeout(() => setCopied(null), 1500)
		}
	}

	return (
		<>
			{/* subscription link */}
			<section className="glass fade-up space-y-3 p-5">
				<div className="text-sm font-semibold">لینک اشتراک</div>
				<div className="flex items-center gap-2">
					<input readOnly value={subUrl} className="input mono flex-1 text-xs" onFocus={(e) => e.currentTarget.select()} />
					<button className="btn btn-primary" onClick={() => copy("sub", subUrl)}>
						{copied === "sub" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
					</button>
					<button className="btn" onClick={() => setQr(qr === subUrl ? null : subUrl)} title="QR">
						<QrCode className="h-4 w-4" />
					</button>
				</div>
				{qr && (
					<div className="fade-up flex flex-col items-center gap-2 pt-2">
						<QR value={qr} size={200} />
						<span className="text-[11px] text-muted">با برنامهٔ خود اسکن کنید</span>
					</div>
				)}
			</section>

			{/* one-tap import */}
			<section className="glass fade-up space-y-3 p-5">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<Smartphone className="h-4 w-4 text-violet-soft" />
					افزودن به برنامه (یک لمس)
				</div>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{APPS.map((a) => (
						<div key={a.name} className="glass glass-2 flex items-center justify-between gap-2 p-3">
							<div className="min-w-0">
								<div className="text-sm font-medium">{a.name}</div>
								<div className="truncate text-[10px] text-muted">{a.os}</div>
							</div>
							<div className="flex shrink-0 items-center gap-1">
								<a className="btn btn-sm btn-primary" href={a.href(subUrl)}>افزودن</a>
								<a className="btn btn-sm btn-ghost" href={a.store} target="_blank" rel="noreferrer" title="دانلود">
									<ExternalLink className="h-3.5 w-3.5" />
								</a>
							</div>
						</div>
					))}
				</div>
			</section>

			{/* individual configs */}
			<section className="glass fade-up p-5">
				<button className="flex w-full items-center justify-between text-sm font-semibold" onClick={() => setShowLinks((v) => !v)}>
					<span>کانفیگ‌ها ({links.length})</span>
					<span className="text-xs text-muted">{showLinks ? "بستن" : "نمایش"}</span>
				</button>
				{showLinks && (
					<ul className="mt-3 space-y-2">
						{links.map((l, i) => (
							<li key={i} className="glass glass-2 flex items-center justify-between gap-2 p-3">
								<div className="min-w-0">
									<div className="truncate text-sm">{l.remark}</div>
									<div className="mono truncate text-[10px] text-muted">{l.uri.split("://")[0]}://…</div>
								</div>
								<div className="flex shrink-0 gap-1">
									<button className="btn btn-sm" onClick={() => copy(`l${i}`, l.uri)}>
										{copied === `l${i}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
									</button>
									<button className="btn btn-sm" onClick={() => setQr(qr === l.uri ? null : l.uri)}>
										<QrCode className="h-3.5 w-3.5" />
									</button>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			{(supportUrl || telegramUrl) && (
				<div className="fade-up flex items-center justify-center gap-2">
					{telegramUrl && (
						<a className="btn" href={telegramUrl} target="_blank" rel="noreferrer">
							<Send className="h-4 w-4" /> تلگرام {brandName}
						</a>
					)}
					{supportUrl && (
						<a className="btn" href={supportUrl} target="_blank" rel="noreferrer">
							<LifeBuoy className="h-4 w-4" /> پشتیبانی
						</a>
					)}
				</div>
			)}
		</>
	)
}
