/** Zarinpal payment gateway (API v4) */
const host = (sandbox: boolean) => (sandbox ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com")

export interface ZpRequestInput {
	merchantId: string
	/** amount in IRT (Toman) */
	amount: number
	description: string
	callbackUrl: string
	sandbox?: boolean
	mobile?: string | null
	email?: string | null
}

export type ZpRequestResult = { ok: true; authority: string; url: string } | { ok: false; error: string; code?: number }

async function zpPost(sandbox: boolean, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
	const res = await fetch(host(sandbox) + path, {
		method: "POST",
		headers: { "content-type": "application/json", accept: "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(20_000),
	})
	const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
	return json
}

function zpError(json: Record<string, unknown>): { message: string; code?: number } {
	const errors = json.errors as Record<string, unknown> | unknown[] | undefined
	if (errors && !Array.isArray(errors)) return { message: String(errors.message ?? "خطای زرین‌پال"), code: Number(errors.code) || undefined }
	return { message: "پاسخ نامعتبر از زرین‌پال" }
}

export async function zarinpalRequest(input: ZpRequestInput): Promise<ZpRequestResult> {
	try {
		const json = await zpPost(!!input.sandbox, "/pg/v4/payment/request.json", {
			merchant_id: input.merchantId,
			amount: Math.round(input.amount),
			currency: "IRT",
			description: input.description.slice(0, 250),
			callback_url: input.callbackUrl,
			metadata: { ...(input.mobile ? { mobile: input.mobile } : {}), ...(input.email ? { email: input.email } : {}) },
		})
		const data = json.data as Record<string, unknown> | undefined
		if (data && Number(data.code) === 100 && typeof data.authority === "string") {
			return { ok: true, authority: data.authority, url: `${host(!!input.sandbox)}/pg/StartPay/${data.authority}` }
		}
		const e = zpError(json)
		return { ok: false, error: e.message, code: e.code }
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) }
	}
}

export type ZpVerifyResult = { ok: true; refId: string; cardPan: string | null; alreadyVerified: boolean } | { ok: false; error: string; code?: number }

export async function zarinpalVerify(input: { merchantId: string; amount: number; authority: string; sandbox?: boolean }): Promise<ZpVerifyResult> {
	try {
		const json = await zpPost(!!input.sandbox, "/pg/v4/payment/verify.json", { merchant_id: input.merchantId, amount: Math.round(input.amount), currency: "IRT", authority: input.authority })
		const data = json.data as Record<string, unknown> | undefined
		const code = data ? Number(data.code) : NaN
		if (code === 100 || code === 101) return { ok: true, refId: String(data!.ref_id ?? ""), cardPan: data!.card_pan ? String(data!.card_pan) : null, alreadyVerified: code === 101 }
		const e = zpError(json)
		return { ok: false, error: e.message, code: e.code }
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) }
	}
}
