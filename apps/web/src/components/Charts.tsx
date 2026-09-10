"use client"

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { formatBytes, formatDate, type Locale } from "@/lib/format"
import { useLocale, useT } from "@/lib/i18n"

export interface UsagePoint {
	day: string
	up: number
	down: number
}

function Tip({ active, payload, label, locale }: any & { locale: Locale }) {
	const t = useT()
	if (!active || !payload?.length) return null
	return (
		<div className="srp-tip">
			<div className="mb-1 font-semibold">{formatDate(label, locale)}</div>
			{payload.map((p: any) => (
				<div key={p.dataKey} className="flex items-center justify-between gap-4">
					<span style={{ color: p.color }}>{p.dataKey === "up" ? t("upload") : t("download")}</span>
					<span className="num">{formatBytes(p.value)}</span>
				</div>
			))}
		</div>
	)
}

export function UsageAreaChart({ data, height = 240 }: { data: UsagePoint[]; height?: number }) {
	const locale = useLocale()
	return (
		<div style={{ height }} dir="ltr">
			<ResponsiveContainer width="100%" height="100%">
				<AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
					<defs>
						<linearGradient id="gDown" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.6} />
							<stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
						</linearGradient>
						<linearGradient id="gUp" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#22d3ee" stopOpacity={0.55} />
							<stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
						</linearGradient>
					</defs>
					<CartesianGrid stroke="rgba(139,92,246,0.16)" strokeDasharray="3 6" vertical={false} />
					<XAxis dataKey="day" tickFormatter={(v) => formatDate(v, locale).replace(/\d{4}/, "").trim()} tick={{ fontSize: 11, fill: "#9a9ab5" }} axisLine={false} tickLine={false} minTickGap={24} />
					<YAxis tickFormatter={(v) => formatBytes(v, 0)} tick={{ fontSize: 11, fill: "#9a9ab5" }} axisLine={false} tickLine={false} width={64} />
					<Tooltip content={<Tip locale={locale} />} cursor={{ stroke: "rgba(139,92,246,0.35)" }} />
					<Area type="monotone" dataKey="down" stroke="#8b5cf6" strokeWidth={2} fill="url(#gDown)" />
					<Area type="monotone" dataKey="up" stroke="#22d3ee" strokeWidth={2} fill="url(#gUp)" />
				</AreaChart>
			</ResponsiveContainer>
		</div>
	)
}

export function MiniBars({ data, height = 56 }: { data: Array<{ at: string; value: number | null }>; height?: number }) {
	return (
		<div style={{ height }} dir="ltr">
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
					<Bar dataKey="value" fill="#8b5cf6" radius={[3, 3, 0, 0]} isAnimationActive={false} />
				</BarChart>
			</ResponsiveContainer>
		</div>
	)
}
