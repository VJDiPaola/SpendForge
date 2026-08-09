import { z } from "zod";

export const integerAmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "Amount must be a non-negative integer string");

export const providerMoneySchema = z
  .object({
    amount: integerAmountSchema,
    decimals: z.number().int().min(0).max(18),
    asset: z.string().trim().min(1).max(16),
    network: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export type ProviderMoney = z.infer<typeof providerMoneySchema>;

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/, "Idempotency key contains unsafe characters");

export const evidenceModeSchema = z.enum(["fixture", "live"]);
export type EvidenceMode = z.infer<typeof evidenceModeSchema>;

export const integrationNameSchema = z.enum([
  "rain",
  "monad_x402",
  "database",
  "decision_model",
]);
export type IntegrationName = z.infer<typeof integrationNameSchema>;
