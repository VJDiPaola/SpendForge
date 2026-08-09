import { z } from "zod";

import {
  evidenceModeSchema,
  idempotencyKeySchema,
  integerAmountSchema,
  providerMoneySchema,
} from "@/lib/integrations/types";

const uuidSchema = z.string().uuid();
const transactionReferenceSchema = uuidSchema.or(
  z.string().regex(/^fixture_rain_tx_[a-f0-9]{16}$/),
);
const rainApiIntegerAmountSchema = integerAmountSchema.refine(
  (amount) => Number.isSafeInteger(Number(amount)),
  "Amount exceeds Rain's JSON integer range",
);
const positiveIntegerAmountSchema = rainApiIntegerAmountSchema.refine(
  (amount) => Number(amount) >= 1,
  "Amount must be at least one minor unit",
);

export const rainIdempotencyKeySchema = idempotencyKeySchema.max(
  64,
  "Rain idempotency keys cannot exceed 64 characters",
);

export const rainFundInputSchema = z
  .object({
    contractId: uuidSchema,
    currency: z.literal("rusd"),
    amount: rainApiIntegerAmountSchema,
    idempotencyKey: rainIdempotencyKeySchema,
  })
  .strict();

export const rainScopedCardInputSchema = z
  .object({
    userId: uuidSchema,
    amountInUSDCents: positiveIntegerAmountSchema,
    idempotencyKey: rainIdempotencyKeySchema,
  })
  .strict();

export const rainAuthorizeInputSchema = z
  .object({
    cardId: uuidSchema,
    amount: positiveIntegerAmountSchema,
    currency: z.literal("USD"),
    merchantName: z.string().trim().min(1).max(200),
    merchantCategoryCode: z.string().regex(/^\d{4}$/),
    idempotencyKey: rainIdempotencyKeySchema,
  })
  .strict();

export const rainSettleInputSchema = z
  .object({
    transactionReference: transactionReferenceSchema,
    idempotencyKey: rainIdempotencyKeySchema,
  })
  .strict();

export const rainReadbackInputSchema = z
  .object({
    transactionReference: transactionReferenceSchema,
  })
  .strict();

export type RainFundInput = z.infer<typeof rainFundInputSchema>;
export type RainScopedCardInput = z.infer<typeof rainScopedCardInputSchema>;
export type RainAuthorizeInput = z.infer<typeof rainAuthorizeInputSchema>;
export type RainSettleInput = z.infer<typeof rainSettleInputSchema>;
export type RainReadbackInput = z.infer<typeof rainReadbackInputSchema>;

export const rainFundResponseSchema = z
  .object({ transactionId: uuidSchema })
  .strip();

const encryptedCardFieldSchema = z
  .object({
    iv: z.string().min(1),
    data: z.string().min(1),
  })
  .strip();

export const rainScopedCardResponseSchema = z
  .object({
    id: uuidSchema,
    encryptedPan: encryptedCardFieldSchema,
    encryptedCvc: encryptedCardFieldSchema,
    last4: z.string().length(4),
    expirationMonth: z.string().min(1),
    expirationYear: z.string().min(1),
    status: z.enum(["notActivated", "active", "locked", "canceled"]),
  })
  .transform(({ id, status }) => ({ id, status }));

export const rainSimulatedTransactionResponseSchema = z
  .object({
    transactionId: uuidSchema,
    status: z.enum(["authorized", "declined", "settled"]),
    declinedReason: z.string().optional(),
    completionReason: z.enum(["SETTLEMENT", "REFUND"]).optional(),
  })
  .strip();

export const rainSpendReadbackResponseSchema = z
  .object({
    id: uuidSchema,
    type: z.literal("spend"),
    spend: z
      .object({
        amount: z.number().int(),
        currency: z.literal("USD"),
        receipt: z.boolean(),
        merchantName: z.string(),
        merchantCategory: z.string(),
        merchantCategoryCode: z.string(),
        cardId: uuidSchema,
        cardType: z.enum(["physical", "virtual"]),
        userId: uuidSchema,
        userFirstName: z.string(),
        userEmail: z.string(),
        status: z.enum(["pending", "reversed", "declined", "completed"]),
        declinedReason: z.string().optional(),
        authorizedAt: z.string(),
        postedAt: z.string().optional(),
      })
      .strip(),
  })
  .strip();

export const rainNormalizedStateSchema = z.enum([
  "accepted",
  "pending",
  "authorized",
  "settlement_pending",
  "settled",
  "declined",
  "failed",
  "unknown",
]);
export type RainNormalizedState = z.infer<typeof rainNormalizedStateSchema>;

const rainReceiptBaseSchema = z
  .object({
    provider: z.literal("rain"),
    providerEnvironment: z.literal("rain-sandbox"),
    evidenceMode: evidenceModeSchema,
    authoritative: z.boolean(),
    providerReference: z.string().trim().min(1).max(200),
    providerStateCode: z.string().trim().min(1).max(200),
    state: rainNormalizedStateSchema,
    observedAt: z.string().datetime({ offset: true }),
    idempotencyKey: rainIdempotencyKeySchema.optional(),
  })
  .strict();

export const rainCollateralReceiptSchema = rainReceiptBaseSchema
  .extend({
    kind: z.literal("collateral"),
    amount: providerMoneySchema,
  })
  .superRefine(rejectAuthoritativeFixture);

export const rainCardReceiptSchema = rainReceiptBaseSchema
  .extend({
    kind: z.literal("scoped_card"),
    cardReference: uuidSchema.or(z.string().startsWith("fixture_")),
    amountLimit: providerMoneySchema,
  })
  .superRefine(rejectAuthoritativeFixture);

export const rainTransactionReceiptSchema = rainReceiptBaseSchema
  .extend({
    kind: z.literal("transaction"),
    transactionReference: transactionReferenceSchema,
    cardReference: uuidSchema.optional(),
    userReference: uuidSchema.optional(),
    amount: providerMoneySchema.optional(),
    merchantName: z.string().trim().min(1).max(200).optional(),
    merchantCategoryCode: z.string().trim().min(1).max(32).optional(),
    authorizedAt: z.string().optional(),
    postedAt: z.string().optional(),
  })
  .superRefine(rejectAuthoritativeFixture);

function rejectAuthoritativeFixture(
  receipt: { evidenceMode: "fixture" | "live"; authoritative: boolean },
  context: z.RefinementCtx,
) {
  if (receipt.evidenceMode === "fixture" && receipt.authoritative) {
    context.addIssue({
      code: "custom",
      path: ["authoritative"],
      message: "Fixture evidence cannot be authoritative",
    });
  }
}

export type RainCollateralReceipt = z.infer<
  typeof rainCollateralReceiptSchema
>;
export type RainCardReceipt = z.infer<typeof rainCardReceiptSchema>;
export type RainTransactionReceipt = z.infer<
  typeof rainTransactionReceiptSchema
>;

export interface RainGateway {
  fundCollateral(input: RainFundInput): Promise<RainCollateralReceipt>;
  issueScopedCard(input: RainScopedCardInput): Promise<RainCardReceipt>;
  authorize(input: RainAuthorizeInput): Promise<RainTransactionReceipt>;
  settle(input: RainSettleInput): Promise<RainTransactionReceipt>;
  readback(input: RainReadbackInput): Promise<RainTransactionReceipt>;
}

export function normalizeRainProviderState(rawState: unknown): {
  state: RainNormalizedState;
  providerStateCode: string;
} {
  const providerStateCode = z.string().trim().min(1).max(200).parse(rawState);
  const stateByProviderCode: Record<string, RainNormalizedState> = {
    active: "accepted",
    accepted: "accepted",
    pending: "pending",
    authorized: "authorized",
    settled: "settled",
    completed: "settled",
    declined: "declined",
    reversed: "failed",
    locked: "failed",
    canceled: "failed",
    notActivated: "failed",
  };

  return {
    state: stateByProviderCode[providerStateCode] ?? "unknown",
    providerStateCode,
  };
}
