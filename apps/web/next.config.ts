import path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
	reactStrictMode: true,
	poweredByHeader: false,
	transpilePackages: ["@srpanel/core", "@srpanel/db"],
	serverExternalPackages: ["@prisma/client"],
	turbopack: { root: path.join(__dirname, "../..") },
	outputFileTracingRoot: path.join(__dirname, "../.."),
	async headers() {
		return [
			{
				source: "/(.*)",
				headers: [
					{ key: "X-Frame-Options", value: "SAMEORIGIN" },
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
				],
			},
		]
	},
}

export default nextConfig
