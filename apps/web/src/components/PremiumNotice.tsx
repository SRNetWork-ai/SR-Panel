"use client"

import Link from "next/link"
import { Lock } from "lucide-react"
import { useLocale } from "@/lib/i18n"

/**
 * One line at the top of the panel telling the admin what this install is not
 * licensed for. Renders nothing on a fully licensed (or vendor) install.
 */
export function PremiumNotice({ locked, missing }: { locked: boolean; missing: string[] }) {
	const locale = useLocale()
	const L = (fa: string, en: string) => (locale === "fa" ? fa : en)
	if (!locked && missing.length === 0) return null
	const text = locked
		? L(
				"\u0642\u0627\u0628\u0644\u06cc\u062a\u200c\u0647\u0627\u06cc \u067e\u0631\u0645\u06cc\u0648\u0645 \u0627\u06cc\u0646 \u067e\u0646\u0644 \u0642\u0641\u0644 \u0627\u0633\u062a\u061b \u06a9\u062f \u0644\u0627\u06cc\u0633\u0646\u0633 \u0631\u0627 \u062f\u0631 \u062a\u0646\u0638\u06cc\u0645\u0627\u062a \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f",
				"Premium features of this install are locked \u2014 enter a license code in settings",
			)
		: L("\u0642\u0627\u0628\u0644\u06cc\u062a\u200c\u0647\u0627\u06cc \u0642\u0641\u0644: ", "Locked features: ") + missing.join(L("\u060c ", ", "))
	return (
		<div className="glass mb-3 flex flex-wrap items-center gap-2 p-3 text-sm fade-up">
			<Lock className="h-4 w-4 text-danger" />
			<span className="text-muted">{text}</span>
			<Link href="/settings" className="chip ms-auto">
				{L("\u0641\u0639\u0627\u0644\u200c\u0633\u0627\u0632\u06cc \u0644\u0627\u06cc\u0633\u0646\u0633", "Activate license")}
			</Link>
		</div>
	)
}
