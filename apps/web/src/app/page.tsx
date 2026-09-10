import { redirect } from "next/navigation"
import { currentAdmin } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function Home() {
	const admin = await currentAdmin()
	redirect(admin ? "/dashboard" : "/login")
}
