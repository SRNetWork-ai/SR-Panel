import Link from "next/link"
import { currentLocale } from "@/lib/auth"

export default async function NotFound() {
	const locale = await currentLocale()
	const fa = locale === "fa"
	return (
		<main className="aurora flex min-h-screen items-center justify-center p-6">
			<div className="glass fade-up w-full max-w-md p-8 text-center">
				<div className="neon-text text-6xl font-black">404</div>
				<h1 className="mt-3 text-lg font-semibold">{fa ? "صفحه پیدا نشد" : "Page not found"}</h1>
				<p className="mt-1 text-sm text-muted">{fa ? "آدرس واردشده وجود ندارد یا منقضی شده است." : "This address does not exist or has expired."}</p>
				<Link href="/" className="btn btn-primary mt-6 inline-flex">{fa ? "بازگشت به پنل" : "Back to panel"}</Link>
			</div>
		</main>
	)
}
