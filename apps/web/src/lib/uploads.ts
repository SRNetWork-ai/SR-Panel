import "server-only"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { randomToken } from "@srpanel/core"

export const UPLOAD_DIR = process.env.SRP_UPLOAD_DIR || join(process.cwd(), "uploads")
export const RECEIPT_MAX = 3 * 1024 * 1024
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }
export const receiptMime = (ext: string) => Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream"

/** Saves a receipt file, returns the stored file name (safe, random). */
export async function saveReceipt(file: File): Promise<string> {
	const ext = EXT[file.type]
	if (!ext) throw new Error("فرمت فایل مجاز نیست (jpg / png / webp / pdf)")
	if (file.size > RECEIPT_MAX) throw new Error("حجم فایل بیشتر از ۳ مگابایت است")
	const dir = join(UPLOAD_DIR, "receipts")
	await mkdir(dir, { recursive: true })
	const name = `${Date.now()}-${randomToken(12)}.${ext}`
	await writeFile(join(dir, name), Buffer.from(await file.arrayBuffer()))
	return name
}

export const receiptPath = (name: string) => join(UPLOAD_DIR, "receipts", name.replace(/[^A-Za-z0-9_.-]/g, ""))
