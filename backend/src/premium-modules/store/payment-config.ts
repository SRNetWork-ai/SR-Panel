export interface StorePaymentCard {
  id: string;
  bankName?: string | null;
  cardNumber?: string | null;
  cardHolder?: string | null;
  iban?: string | null;
  instructions?: string | null;
  enabled?: boolean;
}

export interface NormalizedPaymentConfig {
  methods: Record<string, boolean>;
  cards: StorePaymentCard[];
}

export interface LegacyPaymentFields {
  bankName?: string | null;
  bankCardNumber?: string | null;
  bankCardHolder?: string | null;
  bankIban?: string | null;
  paymentInstructions?: string | null;
}

export const STORE_PAYMENT_METHOD_META: Array<{
  id: string;
  label: string;
  available: boolean;
}> = [
  { id: 'manual_bank', label: 'Card-to-card / manual bank transfer', available: true },
  { id: 'wallet', label: 'Customer wallet balance', available: false },
  { id: 'crypto', label: 'Crypto payment', available: false },
  { id: 'gateway', label: 'Online payment gateway', available: false },
];

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Normalize the JSON paymentConfig column into a stable shape:
 * `{ methods: { manual_bank: boolean, ... }, cards: StorePaymentCard[] }`.
 * Legacy flat bank fields (bankCardNumber, ...) are folded in as the first
 * card when no structured cards exist yet.
 */
export function normalizePaymentConfig(
  raw: unknown,
  fallback?: LegacyPaymentFields | null,
): NormalizedPaymentConfig {
  const cfg = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >;
  const methodsRaw = (
    cfg.methods && typeof cfg.methods === 'object' ? cfg.methods : {}
  ) as Record<string, unknown>;

  const methods: Record<string, boolean> = {};
  for (const meta of STORE_PAYMENT_METHOD_META) {
    const value = methodsRaw[meta.id];
    methods[meta.id] =
      typeof value === 'boolean' ? value : meta.id === 'manual_bank' ? true : false;
  }

  const cardsRaw = Array.isArray(cfg.cards) ? cfg.cards : [];
  const cards: StorePaymentCard[] = cardsRaw
    .filter((card): card is Record<string, unknown> => !!card && typeof card === 'object')
    .map((card, index) => ({
      id: typeof card.id === 'string' && card.id ? card.id : `card-${index + 1}`,
      bankName: asOptionalString(card.bankName),
      cardNumber: asOptionalString(card.cardNumber),
      cardHolder: asOptionalString(card.cardHolder),
      iban: asOptionalString(card.iban),
      instructions: asOptionalString(card.instructions),
      enabled: card.enabled === false ? false : true,
    }));

  if (
    cards.length === 0 &&
    fallback &&
    (fallback.bankCardNumber ||
      fallback.bankName ||
      fallback.bankIban ||
      fallback.paymentInstructions)
  ) {
    cards.push({
      id: 'card-1',
      bankName: fallback.bankName ?? null,
      cardNumber: fallback.bankCardNumber ?? null,
      cardHolder: fallback.bankCardHolder ?? null,
      iban: fallback.bankIban ?? null,
      instructions: fallback.paymentInstructions ?? null,
      enabled: true,
    });
  }

  return { methods, cards };
}

/** First enabled card, used to keep legacy flat profile fields in sync. */
export function primaryCardFromConfig(
  config: NormalizedPaymentConfig | null | undefined,
): StorePaymentCard | null {
  if (!config || !Array.isArray(config.cards) || config.cards.length === 0) return null;
  return config.cards.find((card) => card.enabled !== false) || null;
}
