/** Next.js instrumentation hook — runs once per server boot. */
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return
	const { ensureOwner } = await import("@srpanel/core")
	try {
		await ensureOwner()
	} catch (err) {
		console.error("[srpanel] ensureOwner failed:", err instanceof Error ? err.message : err)
	}
}
