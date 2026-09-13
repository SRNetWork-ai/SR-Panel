import { backupHealth, getBackupSettings, jsonSafe, listBackups } from "@srpanel/core"
import { requireOwner } from "@/lib/auth"
import { BackupsClient } from "./BackupsClient"

export const dynamic = "force-dynamic"

export default async function BackupsPage() {
	await requireOwner()
	const [list, settings, health] = await Promise.all([listBackups(), getBackupSettings(), backupHealth()])
	return <BackupsClient initial={jsonSafe(list) as never} settings={settings} health={jsonSafe(health) as never} />
}
