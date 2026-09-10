import { jsonSafe, topupMethods, walletOverview } from "@srpanel/core"
import { requireAdmin } from "@/lib/auth"
import { WalletClient } from "./WalletClient"

export const dynamic = "force-dynamic"

export default async function WalletPage() {
	const me = await requireAdmin()
	const [overview, methods] = await Promise.all([walletOverview(me), topupMethods()])
	const initial = { ...overview, topupMethods: methods, isOwner: me.role === "OWNER" }
	return <WalletClient initial={jsonSafe(initial) as never} />
}
