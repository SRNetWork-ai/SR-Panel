import path from "node:path"
import type { NextConfig } from "next"

// HSTS only makes sense once the panel really is served over TLS.
const isHttps = (process.env.SRP_PUBLIC_URL || "").startsWith("https://")
// SRP_CSP=off disables the policy, SRP_CSP=report only reports it (escape hatch for odd setups).
const cspMode = (process.env.SRP_CSP || "on").toLowerCase()

// Next ships inline bootstrap scripts and inline styles, so 'unsafe-inline' has to stay;
// the win here is blocking object/base/form-action hijacks and foreign framing.
const csp = [
	"default-src 'self'",
	"base-uri 'self'",
	"object-src 'none'",
	"frame-ancestors 'self'",
	"form-action 'self'",
	"img-src 'self' data: blob: https:",
	"media-src 'self' data: blob:",
	"font-src 'self' data:",
	"style-src 'self' 'unsafe-inline'",
	"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
	"worker-src 'self' blob:",
	"connect-src 'self' https: wss: ws:",
].join("; ")

const securityHeaders: { key: string; value: string }[] = [
	{ key: "X-Frame-Options", value: "SAMEORIGIN" },
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
	{ key: "X-Permitted-Cross-Domain-Policies", value: "none" },
]
if (cspMode !== "off") securityHeaders.push({ key: cspMode === "report" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", value: csp })
if (isHttps) securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" })

const nextConfig: NextConfig = {
	reactStrictMode: true,
	poweredByHeader: false,
	// Type errors are checked separately via `npm run typecheck`; they must never block a production Docker build.
	typescript: { ignoreBuildErrors: true },
	transpilePackages: ["@srpanel/core", "@srpanel/db"],
	serverExternalPackages: ["@prisma/client"],
	turbopack: { root: path.join(__dirname, "../..") },
	outputFileTracingRoot: path.join(__dirname, "../.."),
	async headers() {
		return [{ source: "/(.*)", headers: securityHeaders }]
	},
}

export default nextConfig
