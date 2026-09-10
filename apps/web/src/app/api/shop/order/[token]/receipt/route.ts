import { AppError, latestPaymentByOrderToken, publicOrder, submitProof } from "@srpanel/core"
import { ok, route } from "@/lib/api"
import { saveReceipt } from "@/lib/uploads"

export const dynamic = "force-dynamic"

/** multipart/form-data: file (jpg/png/webp/pdf ≤ 3MB), receiptRef?, cardPan? */
export const POST = route<{ token: string }>(async (req, ctx) => {
	const { token } = await ctx.params
	const { payment } = await latestPaymentByOrderToken(token)
	if (!payment) throw new AppError("پرداختی برای این سفارش ثبت نشده است")
	const form = await req.formData().catch(() => null)
	const file = form?.get("file")
	if (!form || !(file instanceof File) || !file.size) throw new AppError("فایل رسید ارسال نشده است")
	let name: string
	try {
		name = await saveReceipt(file)
	} catch (err) {
		throw new AppError(err instanceof Error ? err.message : "آپلود ناموفق")
	}
	await submitProof(payment.id, { receiptFile: name, receiptRef: String(form.get("receiptRef") ?? "").slice(0, 80) || null, cardPan: String(form.get("cardPan") ?? "").slice(0, 24) || null })
	return ok(await publicOrder(token))
})
