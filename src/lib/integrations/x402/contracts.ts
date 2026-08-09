import { z } from "zod";

import {
  evidenceModeSchema,
  idempotencyKeySchema,
  providerMoneySchema,
  type ProviderMoney,
} from "@/lib/integrations/types";

export const hexAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/);
export type HexAddress = `0x${string}`;

export const x402SupportedConfigSchema = z
  .object({
    provider: z.literal("x402"),
    evidenceMode: evidenceModeSchema,
    authoritative: z.boolean(),
    networks: z.array(z.string().trim().min(1)).min(1),
    schemes: z.array(z.string().trim().min(1)).min(1),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.evidenceMode === "fixture" && config.authoritative) {
      context.addIssue({
        code: "custom",
        path: ["authoritative"],
        message: "Fixture support data cannot be authoritative",
      });
    }
  });

export const x402SettlementReceiptSchema = z
  .object({
    provider: z.literal("x402"),
    providerEnvironment: z.literal("monad-testnet"),
    evidenceMode: evidenceModeSchema,
    authoritative: z.boolean(),
    state: z.enum(["settled", "failed", "unknown"]),
    providerStateCode: z.string().trim().min(1).max(200),
    transactionReference: z.string().trim().min(1).max(200).optional(),
    sellerAddress: hexAddressSchema,
    amount: providerMoneySchema,
    observedAt: z.string().datetime({ offset: true }),
    idempotencyKey: idempotencyKeySchema,
    scheme: z.literal("exact").optional(),
    network: z.literal("eip155:10143").optional(),
    attemptFingerprint: z
      .string()
      .regex(/^sha256:[0-9a-f]{24}$/)
      .optional(),
    paymentRequirementFingerprint: z
      .string()
      .regex(/^sha256:[0-9a-f]{24}$/)
      .optional(),
  })
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.evidenceMode === "fixture" && receipt.authoritative) {
      context.addIssue({
        code: "custom",
        path: ["authoritative"],
        message: "Fixture settlement cannot be authoritative",
      });
    }
    if (receipt.state === "settled" && !receipt.transactionReference) {
      context.addIssue({
        code: "custom",
        path: ["transactionReference"],
        message: "Settled receipts require a transaction reference",
      });
    }
  });

export const x402DeliveryEnvelopeSchema = z
  .object({
    state: z.enum(["delivered", "failed"]),
    contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional(),
    errorCode: z
      .enum([
        "RESOURCE_SCHEMA_INVALID",
        "SELLER_MISMATCH",
        "AMOUNT_EXCEEDS_MAX",
        "DENOMINATION_MISMATCH",
        "PAYMENT_NOT_SETTLED",
      ])
      .optional(),
  })
  .strict()
  .superRefine((delivery, context) => {
    if (delivery.state === "delivered" && !delivery.contentHash) {
      context.addIssue({
        code: "custom",
        path: ["contentHash"],
        message: "Delivered resources require a content hash",
      });
    }
    if (delivery.state === "failed" && !delivery.errorCode) {
      context.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: "Failed deliveries require a safe error code",
      });
    }
  });

export type X402SupportedConfig = z.infer<typeof x402SupportedConfigSchema>;
export type X402SettlementReceipt = z.infer<
  typeof x402SettlementReceiptSchema
>;
export type X402DeliveryEnvelope = z.infer<
  typeof x402DeliveryEnvelopeSchema
>;

export type X402Delivery<T> = X402DeliveryEnvelope & {
  resource?: T;
};

export type X402PurchaseResult<T> = {
  settlement: X402SettlementReceipt;
  delivery: X402Delivery<T>;
};

export type X402PayAndFetchInput<T> = {
  url: string;
  expectedSeller: HexAddress;
  maxAmount: ProviderMoney;
  idempotencyKey: string;
  responseSchema: z.ZodType<T>;
};

export interface X402Gateway {
  getSupported(): Promise<X402SupportedConfig>;
  payAndFetch<T>(
    input: X402PayAndFetchInput<T>,
  ): Promise<X402PurchaseResult<T>>;
}
export function validateX402PayAndFetchInput<T>(
  input: X402PayAndFetchInput<T>,
): X402PayAndFetchInput<T> {
  const base = z
    .object({
      url: z.string().url(),
      expectedSeller: hexAddressSchema,
      maxAmount: providerMoneySchema,
      idempotencyKey: idempotencyKeySchema,
    })
    .strict()
    .parse({
      url: input.url,
      expectedSeller: input.expectedSeller,
      maxAmount: input.maxAmount,
      idempotencyKey: input.idempotencyKey,
    });

  return {
    ...base,
    expectedSeller: base.expectedSeller as HexAddress,
    responseSchema: input.responseSchema,
  };
}
