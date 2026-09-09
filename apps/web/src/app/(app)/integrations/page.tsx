import { getTelegramSettings } from "@srpanel/core"
import { requireAdmin } from "@/lib/auth"
import { toAdminDto } from "@/lib/dto"
import { IntegrationsClient, type TelegramForm } from "./IntegrationsClient"

export const dynamic = "force-dynamic"

export default async function IntegrationsPage() {
	const admin = await requireAdmin()
	let telegram: TelegramForm | null = null
	if (admin.role === "OWNER") {
		const s = await getTelegramSettings()
		telegram = { ...s, botToken: "", botTokenMasked: s.botToken ? s.botToken.slice(0, 6) + "…" + s.botToken.slice(-4) : "", hasToken: !!s.botToken }
	}
	return <IntegrationsClient me={toAdminDto(admin)} telegram={telegram} />
}
