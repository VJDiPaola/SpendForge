import { z } from "zod";

import { rainSandboxBaseUrlSchema } from "../base-url";

export const proofEnvironmentSchema = z
  .object({
    VERCEL_ENV: z.literal("preview"),
    RAIN_BASE_URL: rainSandboxBaseUrlSchema,
    RAIN_API_KEY: z.string().trim().min(1),
    RAIN_USER_ID: z.string().uuid(),
    RAIN_CONTRACT_ID: z.string().uuid(),
    RECOVERY_ENCRYPTION_KEY: z.string().trim().min(1),
    RAIN_MUTATIONS_ENABLED: z.literal("true"),
    RAIN_CARD_ISSUANCE_ENABLED: z.literal("true"),
    RAIN_AUTHORIZATION_ENABLED: z.literal("true"),
    RAIN_SETTLEMENT_ENABLED: z.literal("true"),
    RAIN_NORTHSTAR_PROOF_WINDOW_OPEN: z.literal("true"),
    RAIN_NORTHSTAR_AUTHORIZED_ATTEMPT_ID: z
      .string()
      .regex(/^rain-proof-[a-z0-9-]{12,80}$/),
  })
  .passthrough();

export const encryptedCardFieldSchema = z
  .object({ iv: z.string().min(1), data: z.string().min(1) })
  .strip();
export const cardIssueResponseSchema = z
  .object({
    id: z.string().uuid(),
    encryptedPan: encryptedCardFieldSchema,
    encryptedCvc: encryptedCardFieldSchema,
    last4: z.string().length(4),
    expirationMonth: z.union([z.string().min(1), z.number().int().positive()]),
    expirationYear: z.union([z.string().min(1), z.number().int().positive()]),
    status: z.enum(["notActivated", "active", "locked", "canceled"]),
  })
  .strip();
export const cardReadbackResponseSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    type: z.literal("virtual"),
    status: z.literal("active"),
    limit: z
      .object({
        amount: z.number().int().nonnegative(),
        frequency: z.string().min(1),
      })
      .strip()
      .optional(),
    configuration: z
      .object({ currency: z.string().min(1) })
      .strip()
      .optional(),
  })
  .strip();
export const simulatedTransactionResponseSchema = z
  .object({
    transactionId: z.string().uuid(),
    status: z.enum(["authorized", "declined", "settled"]),
    declinedReason: z.string().optional(),
    completionReason: z.enum(["SETTLEMENT", "settlement", "REFUND", "refund"]).optional(),
  })
  .strip();
export const spendReadbackResponseSchema = z
  .object({
    // Rain's sandbox has returned identifier and enum variants that drift from
    // the published OpenAPI. Parse the observed structural contract here, then
    // enforce every causal value explicitly in requireExactSpend.
    id: z.string().min(1),
    type: z.string().min(1),
    spend: z
      .object({
        amount: z.union([
          z.number().finite().nonnegative(),
          z.string().min(1).max(32),
        ]),
        currency: z.string().min(1),
        receipt: z.boolean().optional(),
        merchantName: z.string(),
        merchantCategory: z.string().optional(),
        merchantCategoryCode: z.string(),
        cardId: z.string().min(1),
        cardType: z.string().min(1),
        userId: z.string().min(1),
        userFirstName: z.string().optional(),
        userEmail: z.string().optional(),
        status: z.string().min(1),
        declinedReason: z.string().optional(),
        authorizedAt: z.string(),
        postedAt: z.string().optional(),
      })
      .strip(),
  })
  .strip();

export const reconciliationEnvironmentSchema = z
  .object({
    VERCEL_ENV: z.literal("preview"),
    RAIN_BASE_URL: rainSandboxBaseUrlSchema,
    RAIN_API_KEY: z.string().trim().min(1),
    RAIN_USER_ID: z.string().uuid(),
    RECOVERY_ENCRYPTION_KEY: z.string().trim().min(1),
    RAIN_NORTHSTAR_RECONCILIATION_WINDOW_OPEN: z.literal("true"),
    RAIN_NORTHSTAR_RECONCILIATION_ATTEMPT_ID: z
      .string()
      .regex(/^rain-reconcile-[a-z0-9-]{12,80}$/),
  })
  .passthrough();

export const resumeEnvironmentSchema = reconciliationEnvironmentSchema.extend({
  RAIN_MUTATIONS_ENABLED: z.literal("true"),
  RAIN_SETTLEMENT_ENABLED: z.literal("true"),
});

export type ProofConfig = z.infer<typeof proofEnvironmentSchema>;
export type ParsedSpendReadback = z.infer<typeof spendReadbackResponseSchema>;
