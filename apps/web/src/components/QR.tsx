"use client"

import { QRCodeSVG } from "qrcode.react"

export function QR({ value, size = 180 }: { value: string; size?: number }) {
	return (
		<div className="inline-block rounded-2xl bg-white p-3 shadow-lg">
			<QRCodeSVG value={value} size={size} level="M" bgColor="#ffffff" fgColor="#14142b" />
		</div>
	)
}
