import type { CardDto, FxDto } from "../types"

/** The exact shape /api/store/extras expects for the FX block. */
export const fxBody = (f: FxDto) => ({
	mode: f.mode,
	sources: f.sources,
	marginPct: Number(f.marginPct) || 0,
	roundTo: Number(f.roundTo) || 0,
	ttlMin: Number(f.ttlMin) || 10,
	minRate: Number(f.minRate) || 0,
	maxRate: Number(f.maxRate) || 0,
	customUrl: f.customUrl,
	customPath: f.customPath,
	customUnit: f.customUnit,
})

/** The bank secret is only sent when the operator typed a new one. */
export const cardBody = (c: CardDto, secret: string) => ({
	mode: c.mode,
	autoConfirm: c.autoConfirm,
	uniqueAmount: c.uniqueAmount,
	windowMin: Number(c.windowMin) || 60,
	toleranceIrt: Number(c.toleranceIrt) || 0,
	requireLast4: c.requireLast4,
	senders: c.senders,
	bankProvider: c.bankProvider,
	bankApiUrl: c.bankApiUrl,
	bankUsername: c.bankUsername,
	bankCard: c.bankCard,
	bankPollMin: Number(c.bankPollMin) || 10,
	...(secret.trim() ? { bankSecret: secret.trim() } : {}),
})
