import { z } from "zod";

import { auditedPurchaseDecisionSchema } from "@/lib/decision/contracts";

const canonicalIsoDateTimeSchema = z.string().refine(
  (value) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
  },
  "Timestamp must be canonical ISO-8601 UTC",
);

export const operationProviderSchema = z.enum([
  "rain",
  "monad_x402",
  "openai",
]);
export type OperationProvider = z.infer<typeof operationProviderSchema>;

export const operationModeSchema = z.enum([
  "fixture",
  "live-sandbox",
  "testnet",
  "live-model",
]);
export type OperationMode = z.infer<typeof operationModeSchema>;

export const operationKindSchema = z.enum([
  "rain.fund_collateral",
  "rain.issue_scoped_card",
  "rain.authorize_transaction",
  "rain.settle_transaction",
  "rain.list_transactions",
  "rain.read_transaction",
  "monad_x402.pay_resource",
  "monad_x402.read_receipt",
  "openai.propose_purchase",
]);
export type OperationKind = z.infer<typeof operationKindSchema>;

export const mutationOperationKindSchema = z.enum([
  "rain.fund_collateral",
  "rain.issue_scoped_card",
  "rain.authorize_transaction",
  "rain.settle_transaction",
  "monad_x402.pay_resource",
  "openai.propose_purchase",
]);
export type MutationOperationKind = z.infer<
  typeof mutationOperationKindSchema
>;

export const safeEndpointSchema = z.enum([
  "/simulate/collateral/fund",
  "/issuing/users/{userId}/cards/scoped",
  "/simulate/transactions/authorize",
  "/simulate/transactions/{transactionId}/settle",
  "/issuing/transactions",
  "/issuing/transactions/{transactionId}",
  "/x402/resource",
  "/x402/receipt/{transactionRef}",
  "/v1/responses",
]);
export type SafeEndpoint = z.infer<typeof safeEndpointSchema>;

export const operationEndpointByKind: Readonly<
  Record<OperationKind, SafeEndpoint>
> = {
  "rain.fund_collateral": "/simulate/collateral/fund",
  "rain.issue_scoped_card": "/issuing/users/{userId}/cards/scoped",
  "rain.authorize_transaction": "/simulate/transactions/authorize",
  "rain.settle_transaction":
    "/simulate/transactions/{transactionId}/settle",
  "rain.list_transactions": "/issuing/transactions",
  "rain.read_transaction": "/issuing/transactions/{transactionId}",
  "monad_x402.pay_resource": "/x402/resource",
  "monad_x402.read_receipt": "/x402/receipt/{transactionRef}",
  "openai.propose_purchase": "/v1/responses",
};

export const operationStateSchema = z.enum([
  "planned",
  "gate-passed",
  "gate-blocked",
  "submitted",
  "provider-accepted",
  "provider-pending",
  "readback-pending",
  "provider-confirmed",
  "provider-declined",
  "provider-failed",
  "ambiguous",
  "closed",
]);
export type OperationState = z.infer<typeof operationStateSchema>;

export const authoritativeReadbackStateSchema = z.enum([
  "not-required",
  "not-started",
  "pending",
  "matched-nonterminal",
  "matched-terminal",
  "no-match",
  "ambiguous",
  "unavailable",
]);
export type AuthoritativeReadbackState = z.infer<
  typeof authoritativeReadbackStateSchema
>;

export const normalizedProviderStateSchema = z.enum([
  "not-observed",
  "pending",
  "authorized",
  "settlement-pending",
  "completed",
  "declined",
  "failed",
  "unknown",
]);
export type NormalizedProviderState = z.infer<
  typeof normalizedProviderStateSchema
>;

export const operationTruthBoundarySchema = z.enum([
  "fixture-only",
  "sandbox-unconfirmed",
  "sandbox-authoritative",
  "testnet-unconfirmed",
  "testnet-authoritative",
  "provider-declined",
  "provider-failed",
  "provider-ambiguous",
  "model-unconfirmed",
  "model-structured-output",
  "model-failed",
  "model-ambiguous",
]);
export type OperationTruthBoundary = z.infer<
  typeof operationTruthBoundarySchema
>;

export const auditTruthBoundarySchema = z.enum([
  ...operationTruthBoundarySchema.options,
  "mixed-unconfirmed",
  "mixed-authoritative",
]);
export type AuditTruthBoundary = z.infer<typeof auditTruthBoundarySchema>;

export const fingerprintSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/, "Fingerprint must be a SHA-256 digest");
export type Fingerprint = z.infer<typeof fingerprintSchema>;

export const publicOperationRefSchema = z
  .string()
  .regex(/^op_[a-z0-9_]{8,64}$/, "Operation reference must be public-safe");
export type PublicOperationRef = z.infer<typeof publicOperationRefSchema>;

export const publicAuditReceiptIdSchema = z
  .string()
  .regex(/^audit_[a-z0-9_]{8,64}$/, "Audit receipt ID must be public-safe");
export type PublicAuditReceiptId = z.infer<typeof publicAuditReceiptIdSchema>;

export const entryRefSchema = z
  .string()
  .regex(/^entry_[a-f0-9]{24}$/, "Entry reference must be derived");
export type EntryRef = z.infer<typeof entryRefSchema>;

export const maskedReferenceSchema = z.string().regex(
  /^[a-z][a-z0-9_]{1,31}:(?:[A-Za-z0-9_-]{2,8}\.\.\.[A-Za-z0-9_-]{2,8}|sha256:[a-f0-9]{16})$/,
  "Provider references must already be masked",
);
export type MaskedReference = z.infer<typeof maskedReferenceSchema>;

export const recoveryReferenceKindSchema = z.enum([
  "rain_card_id",
  "rain_transaction_id",
  "monad_transaction_hash",
]);
export type RecoveryReferenceKind = z.infer<
  typeof recoveryReferenceKindSchema
>;

const base64UrlSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/, "Encrypted fields must use base64url encoding");

export const encryptedRecoveryReferenceSchema = z
  .object({
    version: z.literal(1),
    algorithm: z.literal("A256GCM"),
    kind: recoveryReferenceKindSchema,
    keyFingerprint: z.string().regex(/^sha256:[a-f0-9]{16}$/),
    contextFingerprint: fingerprintSchema,
    iv: base64UrlSchema.min(16).max(32),
    ciphertext: base64UrlSchema.min(16).max(1024),
    authenticationTag: base64UrlSchema.min(16).max(32),
  })
  .strict();
export type EncryptedRecoveryReference = z.infer<
  typeof encryptedRecoveryReferenceSchema
>;

export const safeMoneySchema = z
  .object({
    amount: z
      .string()
      .regex(/^(0|[1-9]\d*)$/, "Amount must be an integer atomic-unit string"),
    decimals: z.number().int().min(0).max(18),
    asset: z.enum(["USD", "rUSD", "USDC"]),
    network: z.enum(["rain-sandbox", "eip155:10143"]).optional(),
  })
  .strict();
export type SafeMoney = z.infer<typeof safeMoneySchema>;

export const evidenceCodeSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{2,63}$/, "Evidence codes must be bounded constants");

export const responseJsonTypeSchema = z.enum([
  "null",
  "boolean",
  "number",
  "string",
  "object",
  "array",
]);
export type ResponseJsonType = z.infer<typeof responseJsonTypeSchema>;

const safeFieldPathSchema = z.string().regex(
  /^[A-Za-z][A-Za-z0-9_-]{0,63}(?:\[\])?(?:\.[A-Za-z][A-Za-z0-9_-]{0,63}(?:\[\])?)*$/,
  "Response field paths must contain schema names only",
);

export const safeResponseShapeSchema = z
  .object({
    rootType: responseJsonTypeSchema,
    fields: z
      .array(
        z
          .object({
            path: safeFieldPathSchema,
            type: responseJsonTypeSchema,
          })
          .strict(),
      )
      .max(100),
    omittedSensitiveFieldCount: z.number().int().min(0),
    truncated: z.boolean(),
  })
  .strict()
  .superRefine((shape, context) => {
    const seen = new Set<string>();
    for (const field of shape.fields) {
      const key = `${field.path}:${field.type}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          message: "Response shape fields must be unique",
          path: ["fields"],
        });
        return;
      }
      seen.add(key);
    }
  });
export type SafeResponseShape = z.infer<typeof safeResponseShapeSchema>;

export const authoritativeReadbackSchema = z
  .object({
    state: authoritativeReadbackStateSchema,
    observedAt: canonicalIsoDateTimeSchema.optional(),
    providerState: normalizedProviderStateSchema,
    matchCodes: z.array(evidenceCodeSchema).max(12),
  })
  .strict();
export type AuthoritativeReadback = z.infer<
  typeof authoritativeReadbackSchema
>;

const operationEntryDraftObjectSchema = z
  .object({
    operationRef: publicOperationRefSchema,
    occurredAt: canonicalIsoDateTimeSchema,
    provider: operationProviderSchema,
    mode: operationModeSchema,
    operation: operationKindSchema,
    endpoint: safeEndpointSchema,
    mutation: z.boolean(),
    state: operationStateSchema,
    truthBoundary: operationTruthBoundarySchema,
    idempotencyFingerprint: fingerprintSchema.optional(),
    amount: safeMoneySchema.optional(),
    providerHttpStatus: z.number().int().min(100).max(599).optional(),
    providerRequestRef: maskedReferenceSchema.optional(),
    providerCorrelationRef: maskedReferenceSchema.optional(),
    responseShape: safeResponseShapeSchema.optional(),
    authoritativeReadback: authoritativeReadbackSchema,
    evidenceCodes: z.array(evidenceCodeSchema).min(1).max(20),
    decisionAudit: auditedPurchaseDecisionSchema.optional(),
    deliveryContentHash: fingerprintSchema.optional(),
    recoveryEnvelope: encryptedRecoveryReferenceSchema.optional(),
  })
  .strict();

export const operationEntryDraftSchema = operationEntryDraftObjectSchema;
export type OperationEntryDraft = z.infer<typeof operationEntryDraftSchema>;

export const operationJournalEntrySchema = operationEntryDraftObjectSchema
  .extend({
    schemaVersion: z.literal(1),
    sequence: z.number().int().positive(),
    entryRef: entryRefSchema,
  })
  .strict();
export type OperationJournalEntry = z.infer<
  typeof operationJournalEntrySchema
>;

export const readbackCountsSchema = z
  .object({
    notRequired: z.number().int().min(0),
    notStarted: z.number().int().min(0),
    pending: z.number().int().min(0),
    matchedNonterminal: z.number().int().min(0),
    matchedTerminal: z.number().int().min(0),
    noMatch: z.number().int().min(0),
    ambiguous: z.number().int().min(0),
    unavailable: z.number().int().min(0),
  })
  .strict();

/**
 * A detached HMAC-SHA256 signature over every other field of the receipt.
 * `salt` is part of the signed message and is published here so verification
 * is exact; it exists only to re-derive a digest that the PAN scanner would
 * otherwise reject.
 */
export const receiptSignatureSchema = z
  .object({
    algorithm: z.literal("HMAC-SHA256"),
    keyId: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/, "Key id contains unsafe characters"),
    salt: z.number().int().min(0).max(63),
    value: z
      .string()
      .regex(/^hmac-sha256:[a-f0-9]{64}$/, "Signature must be an HMAC-SHA256 digest"),
  })
  .strict();
export type ReceiptSignature = z.infer<typeof receiptSignatureSchema>;

export const auditReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    receiptId: publicAuditReceiptIdSchema,
    generatedAt: canonicalIsoDateTimeSchema,
    modes: z.array(operationModeSchema).min(1).max(4),
    providers: z.array(operationProviderSchema).min(1).max(3),
    truthBoundary: auditTruthBoundarySchema,
    redacted: z.literal(true),
    synthetic: z.boolean(),
    disclosureCode: evidenceCodeSchema,
    journalHash: fingerprintSchema,
    summary: z
      .object({
        operationCount: z.number().int().min(0),
        mutationCount: z.number().int().min(0),
        authoritativeTerminalCount: z.number().int().min(0),
        readbackCounts: readbackCountsSchema,
      })
      .strict(),
    operations: z.array(operationJournalEntrySchema).max(500),
    signature: receiptSignatureSchema.optional(),
  })
  .strict();
export type AuditReceipt = z.infer<typeof auditReceiptSchema>;

export { canonicalIsoDateTimeSchema };
