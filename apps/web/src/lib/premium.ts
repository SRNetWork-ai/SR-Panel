import "server-only"
import { requirePremium, type LicenseFeature } from "@srpanel/core"

/**
 * Which API paths belong to a paid feature.
 *
 * Everything not listed here is free forever: login, clients, servers, admins,
 * api keys, audit, logs, notifications, updates, stats, the v1 API and all of
 * the settings a free install needs (account, security, appearance, mail,
 * telegram alerts, license). A prefix also covers its sub-paths.
 */
const PREMIUM_PATHS: ReadonlyArray<readonly [string, LicenseFeature]> = [
	// web store, mini app, orders, checkout and the customer accounts behind them
	["/api/store", "store"],
	["/api/shop", "store"],
	["/api/orders", "store"],
	["/api/payments", "store"],
	["/api/plans", "store"],
	["/api/customers", "store"],
	// wallet / credit
	["/api/wallet", "wallet"],
	// discount codes
	["/api/discounts", "discounts"],
	// monitoring + incidents
	["/api/monitoring", "monitoring"],
	["/api/incidents", "monitoring"],
	["/api/settings/monitoring", "monitoring"],
	// scheduled backup center
	["/api/backups", "backupCenter"],
	["/api/settings/backup", "backupCenter"],
	// per-admin branding
	["/api/settings/brand", "branding"],
	// reseller sales bots
	["/api/settings/reseller-bots", "salesBot"],
	// client template system
	["/api/settings/client-types", "clientTemplates"],
]

/** The paid feature a request path needs, or null when the path is free. */
export function premiumFeatureForPath(pathname: string): LicenseFeature | null {
	for (const [prefix, feature] of PREMIUM_PATHS) {
		if (pathname === prefix || pathname.startsWith(prefix + "/")) return feature
	}
	return null
}

/** Throws a Persian 403 when this install is not licensed for the path. */
export async function guardPremiumPath(pathname: string): Promise<void> {
	const feature = premiumFeatureForPath(pathname)
	if (feature) await requirePremium(feature)
}
