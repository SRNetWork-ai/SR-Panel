import { prisma } from "@srpanel/db"
import { onAuditEvent } from "./notifications"
import { emitEvent } from "./webhooks"

/**
 * Writes an audit row and fans the event out to webhooks + Telegram (login alerts).
 * Never throws.
 */
export async function audit(
	adminId: string | null,
	action: string,
	target?: string | null,
	meta?: Record<string, unknown>,
	ip?: string | null,
): Promise<void> {
	try {
		await prisma.auditLog.create({
			data: { adminId, action, target: target ?? null, meta: (meta ?? undefined) as any, ip: ip ?? null },
		})
	} catch (err) {
		console.error("[srpanel] audit failed", err)
	}
	try {
		await emitEvent(adminId, action, { target: target ?? null, meta: meta ?? {}, ip: ip ?? null })
	} catch (err) {
		console.error("[srpanel] webhook emit failed", err instanceof Error ? err.message : err)
	}
	await onAuditEvent(adminId, action, target ?? null, meta, ip)
}
