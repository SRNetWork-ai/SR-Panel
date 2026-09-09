import { getBackupSettings, jsonSafe, listBackups } from "@srpanel/core"
import { requireOwner } from "@/lib/auth"
import { BackupsClient } from "./BackupsClient"

export const dynamic = "force-dynamic"

export default async function BackupsPage() {
	await requireOwner()
	const [list, settings] = await Promise.all([listBackups(), getBackupSettings()])
	return <BackupsClient initial={jsonSafe(list) as never} settings={settings} />
}
