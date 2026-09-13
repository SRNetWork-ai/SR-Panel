import "server-only"
import { cookies } from "next/headers"
import { CUSTOMER_SESSION_DAYS, NotFoundError, UnauthorizedError, customerFromToken, getStoreBySlug, type StoreContext } from "@srpanel/core"
import type { Customer } from "@srpanel/db"
import { cookieSecure } from "./auth"

/** Storefront (customer) session cookie — completely separate from the admin one. */
export const CUSTOMER_COOKIE = "srp_shop"

export function customerCookieOptions() {
	return { httpOnly: true, sameSite: "lax" as const, secure: cookieSecure(), path: "/", maxAge: CUSTOMER_SESSION_DAYS * 86_400 }
}

export async function currentCustomer(): Promise<Customer | null> {
	const jar = await cookies()
	return customerFromToken(jar.get(CUSTOMER_COOKIE)?.value)
}

export async function requireCustomer(): Promise<Customer> {
	const customer = await currentCustomer()
	if (!customer) throw new UnauthorizedError()
	return customer
}

export async function requireStore(slug: string): Promise<StoreContext> {
	const store = await getStoreBySlug(slug)
	if (!store) throw new NotFoundError("فروشگاه پیدا نشد یا غیرفعال است")
	return store
}
