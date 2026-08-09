import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { rainSandboxBaseUrlSchema } from "./base-url";
import { generateRainSessionId } from "./session";
import {
  appendDurableOperationState,
  buildAuditReceipt,
  captureResponseShape,
  claimDurableOperationAttempt,
  deriveEvidenceFingerprint,
  deriveIdempotencyFingerprint,
  maskProviderReference,
  type AuditReceipt,
  type DurableOperationJournalStore,
  type OperationEntryDraft,
  type OperationJournalEntry,
  type OperationKind,
  type PublicOperationRef,
  type RecoveryReferenceKind,
  type SafeEndpoint,
  type SafeMoney,
} from "@/lib/operations";
import {
  decryptRecoveryReference,
  encryptRecoveryReference,
} from "@/lib/operations/recovery";
import { createRuntimeOperationJournalStore } from "@/lib/operations/postgres-store";

export const RAIN_NORTHSTAR_PROOF_RECEIPT_ID =
  "audit_rain_northstar_spend_live_v1";
const configuredAttemptContext = () =>
  process.env.RAIN_NORTHSTAR_AUTHORIZED_ATTEMPT_ID?.trim() || "fixture";

export const RAIN_NORTHSTAR_RUN_SCOPE = deriveEvidenceFingerprint(
  `spendforge:atlas:rain-northstar-proof:v1:${configuredAttemptContext()}`,
);

const cardOperationRef = "op_rain_northstar_card_v1";
const authorizeOperationRef = "op_rain_northstar_authorize_v1";
const settleOperationRef = "op_rain_northstar_settle_v1";
const resumeReadOperationRef = "op_rain_northstar_resume_read_v3";
const merchantName = "Northstar Synthetic";
const merchantCategoryCode = "5734";
const purchaseAmount: SafeMoney = {
  amount: "12",
  decimals: 2,
  asset: "USD",
  network: "rain-sandbox",
};
const cardLimitAmount: SafeMoney = {
  amount: "12",
  decimals: 2,
  asset: "USDC",
  network: "rain-sandbox",
};

const proofEnvironmentSchema = z
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

const encryptedCardFieldSchema = z
  .object({ iv: z.string().min(1), data: z.string().min(1) })
  .strip();
const cardIssueResponseSchema = z
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
const cardReadbackResponseSchema = z
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
const simulatedTransactionResponseSchema = z
  .object({
    transactionId: z.string().uuid(),
    status: z.enum(["authorized", "declined", "settled"]),
    declinedReason: z.string().optional(),
    completionReason: z.enum(["SETTLEMENT", "REFUND"]).optional(),
  })
  .strip();
const spendReadbackResponseSchema = z
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

type ProofConfig = z.infer<typeof proofEnvironmentSchema>;
type ProviderCall = {
  status: number;
  ok: boolean;
  payload: unknown;
  responseShape: ReturnType<typeof captureResponseShape>;
};

const settlement400Codes = [
  [/already settled/i, "SETTLE_400_ALREADY_SETTLED"],
  [/already closed/i, "SETTLE_400_ALREADY_CLOSED"],
  [/no card associated/i, "SETTLE_400_NO_CARD_ASSOCIATION"],
  [/processor id/i, "SETTLE_400_NO_PROCESSOR_ID"],
] as const;

function classifySettlement400(payload: unknown): string {
  const message =
    typeof payload === "object" && payload !== null && "message" in payload
      ? (payload as { message?: unknown }).message
      : undefined;
  if (typeof message !== "string") return "SETTLE_400_UNRECOGNIZED";
  return (
    settlement400Codes.find(([pattern]) => pattern.test(message))?.[1] ??
    "SETTLE_400_UNRECOGNIZED"
  );
}

export type RainNorthstarProofResult = {
  receipt: AuditReceipt;
  providerCalls: number;
  mutationCalls: 3;
  readbackCalls: number;
  paymentClaim: "rain-sandbox-simulated-spend-completed";
  fundingClaim: "prior-funding-remains-uncorrelated";
  cardLimitClaim: "request-only" | "direct-readback-match" | "direct-readback-different";
  truthBoundary: "sandbox-authoritative";
};

export class RainNorthstarProofError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly providerCalls = 0,
  ) {
    super(code);
    this.name = "RainNorthstarProofError";
  }
}

function exactValue(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function providerIdempotencyKey(
  operation: OperationKind,
  fingerprint: string,
  encodedRecoveryKey: string,
): string {
  return `sf-${createHmac("sha256", Buffer.from(encodedRecoveryKey, "base64"))
    .update(`${operation}\u001f${fingerprint}`, "utf8")
    .digest("hex")
    .slice(0, 40)}`;
}

async function providerCall(input: {
  config: Pick<ProofConfig, "RAIN_BASE_URL" | "RAIN_API_KEY">;
  fetchImpl: typeof globalThis.fetch;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  sessionId?: string;
}): Promise<ProviderCall> {
  const headers = new Headers({
    Accept: "application/json",
    "Api-Key": input.config.RAIN_API_KEY,
  });
  if (input.body !== undefined) headers.set("Content-Type", "application/json");
  if (input.idempotencyKey) headers.set("Idempotency-Key", input.idempotencyKey);
  if (input.sessionId) headers.set("sessionid", input.sessionId);

  let response: Response;
  try {
    response = await input.fetchImpl(`${input.config.RAIN_BASE_URL}${input.path}`, {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new RainNorthstarProofError("RAIN_PROVIDER_OUTCOME_AMBIGUOUS", 502, 1);
  }
  const payload = await response.json().catch(() => null);
  return {
    status: response.status,
    ok: response.ok,
    payload,
    responseShape: captureResponseShape(payload),
  };
}

const reconciliationEnvironmentSchema = z
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

const resumeEnvironmentSchema = reconciliationEnvironmentSchema.extend({
  RAIN_MUTATIONS_ENABLED: z.literal("true"),
  RAIN_SETTLEMENT_ENABLED: z.literal("true"),
});

export function inspectRainReconciliationReadiness(
  source: Record<string, string | undefined> = process.env,
) {
  const attemptPattern = /^rain-reconcile-[a-z0-9-]{12,80}$/;
  const recoveryKey = source.RECOVERY_ENCRYPTION_KEY;
  const checks = {
    preview: source.VERCEL_ENV === "preview",
    baseUrlAllowed: rainSandboxBaseUrlSchema.safeParse(source.RAIN_BASE_URL).success,
    apiKeyPresent: Boolean(source.RAIN_API_KEY?.trim()),
    userIdValid: z.string().uuid().safeParse(source.RAIN_USER_ID).success,
    recoveryKeyValid: Boolean(
      recoveryKey && Buffer.from(recoveryKey, "base64").length === 32,
    ),
    databaseConfigured: Boolean(source.DATABASE_URL?.trim()),
    windowOpen: source.RAIN_NORTHSTAR_RECONCILIATION_WINDOW_OPEN === "true",
    attemptConfigured: attemptPattern.test(
      source.RAIN_NORTHSTAR_RECONCILIATION_ATTEMPT_ID ?? "",
    ),
  };
  return { ...checks, ready: Object.values(checks).every(Boolean) };
}

const operationMetadata: Readonly<
  Record<
    "card" | "authorize" | "settle",
    {
      operationRef: PublicOperationRef;
      operation: OperationKind;
      endpoint: SafeEndpoint;
      amount: SafeMoney;
      offerRef: string;
    }
  >
> = {
  card: {
    operationRef: cardOperationRef,
    operation: "rain.issue_scoped_card",
    endpoint: "/issuing/users/{userId}/cards/scoped",
    amount: cardLimitAmount,
    offerRef: "northstar_scoped_card",
  },
  authorize: {
    operationRef: authorizeOperationRef,
    operation: "rain.authorize_transaction",
    endpoint: "/simulate/transactions/authorize",
    amount: purchaseAmount,
    offerRef: "offer_northstar_background_v1",
  },
  settle: {
    operationRef: settleOperationRef,
    operation: "rain.settle_transaction",
    endpoint: "/simulate/transactions/{transactionId}/settle",
    amount: purchaseAmount,
    offerRef: "offer_northstar_background_v1_settlement",
  },
};

const resumeReadMetadata = {
  operationRef: resumeReadOperationRef as PublicOperationRef,
  operation: "rain.read_transaction" as const,
  endpoint: "/issuing/transactions/{transactionId}" as SafeEndpoint,
  amount: purchaseAmount,
};

function fingerprintFor(kind: keyof typeof operationMetadata) {
  const metadata = operationMetadata[kind];
  return deriveIdempotencyFingerprint({
    missionRef: "mission_atlas_launch_v1",
    runRef: `run_atlas_rain_northstar_live_v1:${configuredAttemptContext()}`,
    offerRef: metadata.offerRef,
    provider: "rain",
    operation: metadata.operation as
      | "rain.issue_scoped_card"
      | "rain.authorize_transaction"
      | "rain.settle_transaction",
    generation: 1,
  });
}

function draft(
  kind: keyof typeof operationMetadata,
  input: Omit<
    OperationEntryDraft,
    | "operationRef"
    | "provider"
    | "mode"
    | "operation"
    | "endpoint"
    | "mutation"
    | "idempotencyFingerprint"
    | "amount"
  >,
): OperationEntryDraft {
  const metadata = operationMetadata[kind];
  return {
    operationRef: metadata.operationRef,
    provider: "rain",
    mode: "live-sandbox",
    operation: metadata.operation,
    endpoint: metadata.endpoint,
    mutation: true,
    idempotencyFingerprint: fingerprintFor(kind),
    amount: metadata.amount,
    ...input,
  };
}

function resumeReadDraft(
  input: Omit<
    OperationEntryDraft,
    | "operationRef"
    | "provider"
    | "mode"
    | "operation"
    | "endpoint"
    | "mutation"
    | "idempotencyFingerprint"
    | "amount"
  >,
): OperationEntryDraft {
  return {
    operationRef: resumeReadMetadata.operationRef,
    provider: "rain",
    mode: "live-sandbox",
    operation: resumeReadMetadata.operation,
    endpoint: resumeReadMetadata.endpoint,
    mutation: false,
    amount: resumeReadMetadata.amount,
    ...input,
  };
}

async function claim(
  kind: keyof typeof operationMetadata,
  store: DurableOperationJournalStore,
) {
  const submitted = draft(kind, {
    occurredAt: new Date().toISOString(),
    state: "submitted",
    truthBoundary: "sandbox-unconfirmed",
    authoritativeReadback: {
      state: "not-started",
      providerState: "not-observed",
      matchCodes: [],
    },
    evidenceCodes: [
      "DURABLE_MUTATION_CLAIM",
      "ONE_ATTEMPT_GATE",
      "RUN_WIDE_CAP_CHECKED",
    ],
  });
  const metadata = operationMetadata[kind];
  const result = await claimDurableOperationAttempt({
    store,
    scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
    guard: {
      provider: "rain",
      mode: "live-sandbox",
      mutationEnabled: true,
      allowedOperation: metadata.operation as
        | "rain.issue_scoped_card"
        | "rain.authorize_transaction"
        | "rain.settle_transaction",
      maxMutations: 3,
      oneAttemptOnly: true,
      spendCap: metadata.amount,
      cumulativeSpendCap: {
        amount: "25",
        decimals: 2,
        asset: "USD",
        network: "rain-sandbox",
      },
    },
    request: {
      operationRef: metadata.operationRef,
      provider: "rain",
      mode: "live-sandbox",
      operation: metadata.operation as
        | "rain.issue_scoped_card"
        | "rain.authorize_transaction"
        | "rain.settle_transaction",
      attempt: 1,
      idempotencyFingerprint: fingerprintFor(kind),
      amount: metadata.amount,
    },
    submitted,
  });
  if (!result.decision.allowed) {
    throw new RainNorthstarProofError("RAIN_PROOF_ALREADY_CLAIMED", 409);
  }
}

function recoveryEnvelope(
  journal: readonly OperationJournalEntry[],
  kind: RecoveryReferenceKind,
) {
  return [...journal]
    .reverse()
    .find((entry) => entry.recoveryEnvelope?.kind === kind)?.recoveryEnvelope;
}

type ParsedSpendReadback = z.infer<typeof spendReadbackResponseSchema>;

function classifySpendAmount(
  amount: ParsedSpendReadback["spend"]["amount"],
): "documented-minor-units" | "observed-major-units" | "mismatch" {
  const canonical = typeof amount === "number" ? String(amount) : amount;
  if (canonical === "12") return "documented-minor-units";
  if (canonical === "0.12") return "observed-major-units";
  return "mismatch";
}

function evaluateExactSpend(input: {
  payload: ParsedSpendReadback;
  transactionId: string;
  cardId: string;
  userId: string;
}) {
  const { payload, transactionId, cardId, userId } = input;
  const amountEncoding = classifySpendAmount(payload.spend.amount);
  const merchantExact = payload.spend.merchantName === merchantName;
  const merchantNormalized =
    payload.spend.merchantName.trim().toLocaleLowerCase("en-US") ===
    merchantName.toLocaleLowerCase("en-US");
  const currencyExact = payload.spend.currency === "USD";
  const currencyNormalized = payload.spend.currency.trim().toUpperCase() === "USD";
  const matchCodes = [
    ...(payload.id === transactionId ? ["TRANSACTION_ID_MATCH"] : []),
    ...(payload.type === "spend" ? ["TRANSACTION_TYPE_SPEND_MATCH"] : []),
    ...(payload.spend.cardId === cardId ? ["CARD_ID_MATCH"] : []),
    ...(payload.spend.userId === userId ? ["USER_ID_MATCH"] : []),
    ...(amountEncoding === "documented-minor-units"
      ? ["AMOUNT_12_USD_CENTS_MATCH"]
      : amountEncoding === "observed-major-units"
        ? ["AMOUNT_0_12_USD_OBSERVED_API_DRIFT"]
        : []),
    ...(currencyExact
      ? ["CURRENCY_USD_MATCH"]
      : currencyNormalized
        ? ["CURRENCY_USD_CASE_VARIANT"]
        : []),
    ...(merchantExact
      ? ["MERCHANT_MATCH"]
      : merchantNormalized
        ? ["MERCHANT_CASE_OR_WHITESPACE_VARIANT"]
        : []),
    ...(payload.spend.merchantCategoryCode === merchantCategoryCode
      ? ["MCC_5734_MATCH"]
      : []),
    ...(payload.spend.cardType === "virtual" ? ["CARD_TYPE_VIRTUAL"] : []),
  ];
  const requiredCodes = [
    "TRANSACTION_ID_MATCH",
    "TRANSACTION_TYPE_SPEND_MATCH",
    "CARD_ID_MATCH",
    "USER_ID_MATCH",
    "MCC_5734_MATCH",
    "CARD_TYPE_VIRTUAL",
  ];
  return {
    amountEncoding,
    matchCodes,
    matchesAllCausalFields:
      amountEncoding !== "mismatch" &&
      merchantNormalized &&
      currencyNormalized &&
      requiredCodes.every((code) => matchCodes.includes(code)),
  } as const;
}

function requireExactSpend(input: {
  payload: z.infer<typeof spendReadbackResponseSchema>;
  transactionId: string;
  cardId: string;
  userId: string;
}) {
  return evaluateExactSpend(input).matchesAllCausalFields;
}

export async function executeRainNorthstarProof(input: {
  attemptId: string | null;
  source?: Record<string, string | undefined>;
  store?: DurableOperationJournalStore;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<RainNorthstarProofResult> {
  const source = input.source ?? process.env;
  const parsed = proofEnvironmentSchema.safeParse(source);
  if (!parsed.success) throw new RainNorthstarProofError("RAIN_PROOF_UNAVAILABLE", 503);
  const config = parsed.data;
  if (
    !input.attemptId ||
    !exactValue(input.attemptId, config.RAIN_NORTHSTAR_AUTHORIZED_ATTEMPT_ID)
  ) {
    throw new RainNorthstarProofError("RAIN_PROOF_UNAUTHORIZED", 401);
  }
  let store: DurableOperationJournalStore;
  try {
    store = input.store ?? createRuntimeOperationJournalStore(source);
  } catch {
    throw new RainNorthstarProofError("RAIN_JOURNAL_UNAVAILABLE", 503);
  }
  if (store.durability !== "durable") {
    throw new RainNorthstarProofError("RAIN_PROOF_UNAVAILABLE", 503);
  }
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  let providerCalls = 0;
  let readbackCalls = 0;

  await claim("card", store);
  const cardResponse = await providerCall({
    config,
    fetchImpl,
    method: "POST",
    path: `/issuing/users/${encodeURIComponent(config.RAIN_USER_ID)}/cards/scoped`,
    idempotencyKey: providerIdempotencyKey(
      "rain.issue_scoped_card",
      fingerprintFor("card"),
      config.RECOVERY_ENCRYPTION_KEY,
    ),
    sessionId: generateRainSessionId(),
    body: {
      amountInUSDCents: 12,
      allowedMccs: [merchantCategoryCode],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  });
  providerCalls += 1;
  const cardParsed = cardIssueResponseSchema.safeParse(cardResponse.payload);
  if (!cardResponse.ok || !cardParsed.success) {
    await appendDurableOperationState({
      store,
      scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
      draft: draft("card", {
        occurredAt: new Date().toISOString(),
        state: "ambiguous",
        truthBoundary: "provider-ambiguous",
        providerHttpStatus: cardResponse.status,
        responseShape: cardResponse.responseShape,
        authoritativeReadback: {
          state: "unavailable",
          observedAt: new Date().toISOString(),
          providerState: "unknown",
          matchCodes: [],
        },
        evidenceCodes: ["CARD_RESPONSE_UNCONFIRMED", "NO_AUTOMATIC_RETRY"],
      }),
    });
    throw new RainNorthstarProofError("RAIN_CARD_UNCONFIRMED", 502, providerCalls);
  }
  const cardId = cardParsed.data.id;
  const cardContext = fingerprintFor("card");
  await appendDurableOperationState({
    store,
    scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
    draft: draft("card", {
      occurredAt: new Date().toISOString(),
      state: "provider-accepted",
      truthBoundary: "sandbox-unconfirmed",
      providerHttpStatus: cardResponse.status,
      providerCorrelationRef: maskProviderReference("rain_card", cardId),
      responseShape: cardResponse.responseShape,
      recoveryEnvelope: encryptRecoveryReference({
        kind: "rain_card_id",
        rawReference: cardId,
        contextFingerprint: cardContext,
        encodedKey: config.RECOVERY_ENCRYPTION_KEY,
      }),
      authoritativeReadback: {
        state: "not-started",
        providerState: "not-observed",
        matchCodes: [],
      },
      evidenceCodes: [
        "CARD_RESPONSE_VALIDATED",
        "ENCRYPTED_RECOVERY_REFERENCE_STORED",
        "CAP_12_USDC_CENTS_REQUESTED",
        "MCC_5734_REQUESTED",
        "EXPIRY_REQUESTED",
      ],
    }),
  });

  const cardReadback = await providerCall({
    config,
    fetchImpl,
    method: "GET",
    path: `/issuing/cards/${encodeURIComponent(cardId)}`,
  });
  providerCalls += 1;
  readbackCalls += 1;
  const cardReadbackParsed = cardReadbackResponseSchema.safeParse(cardReadback.payload);
  if (
    !cardReadback.ok ||
    !cardReadbackParsed.success ||
    cardReadbackParsed.data.id !== cardId ||
    cardReadbackParsed.data.userId !== config.RAIN_USER_ID
  ) {
    await appendDurableOperationState({
      store,
      scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
      draft: draft("card", {
        occurredAt: new Date().toISOString(),
        state: "ambiguous",
        truthBoundary: "provider-ambiguous",
        providerHttpStatus: cardReadback.status,
        responseShape: cardReadback.responseShape,
        authoritativeReadback: {
          state: "ambiguous",
          observedAt: new Date().toISOString(),
          providerState: "unknown",
          matchCodes: [],
        },
        evidenceCodes: ["CARD_READBACK_MISMATCH", "DEPENDENT_CALLS_BLOCKED"],
      }),
    });
    throw new RainNorthstarProofError("RAIN_CARD_READBACK_MISMATCH", 502, providerCalls);
  }
  const observedCardLimit = cardReadbackParsed.data.limit?.amount;
  const cardLimitClaim = observedCardLimit === undefined
    ? "request-only"
    : observedCardLimit === 12
      ? "direct-readback-match"
      : "direct-readback-different";
  await appendDurableOperationState({
    store,
    scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
    draft: draft("card", {
      occurredAt: new Date().toISOString(),
      state: "provider-confirmed",
      truthBoundary: "sandbox-authoritative",
      providerHttpStatus: cardReadback.status,
      providerCorrelationRef: maskProviderReference("rain_card", cardId),
      responseShape: cardReadback.responseShape,
      authoritativeReadback: {
        state: "matched-terminal",
        observedAt: new Date().toISOString(),
        providerState: "completed",
        matchCodes: [
          "CARD_ID_MATCH",
          "USER_ID_MATCH",
          "CARD_STATUS_ACTIVE",
          "CARD_TYPE_VIRTUAL",
          cardLimitClaim === "direct-readback-match"
            ? "CAP_READBACK_MATCH"
            : cardLimitClaim === "direct-readback-different"
              ? "CAP_READBACK_DIFFERENT"
              : "CAP_REQUEST_ONLY",
        ],
      },
      evidenceCodes: ["CARD_ISSUANCE_CONFIRMED", "DIRECT_CARD_READBACK"],
    }),
  });

  await claim("authorize", store);
  const journalWithCard = await store.read(RAIN_NORTHSTAR_RUN_SCOPE);
  const storedCardEnvelope = recoveryEnvelope(journalWithCard, "rain_card_id");
  if (!storedCardEnvelope) throw new RainNorthstarProofError("RAIN_RECOVERY_UNAVAILABLE", 503, providerCalls);
  const recoveredCardId = decryptRecoveryReference({
    envelope: storedCardEnvelope,
    expectedKind: "rain_card_id",
    expectedContextFingerprint: cardContext,
    encodedKey: config.RECOVERY_ENCRYPTION_KEY,
  });
  const authorizeResponse = await providerCall({
    config,
    fetchImpl,
    method: "POST",
    path: "/simulate/transactions/authorize",
    idempotencyKey: providerIdempotencyKey(
      "rain.authorize_transaction",
      fingerprintFor("authorize"),
      config.RECOVERY_ENCRYPTION_KEY,
    ),
    body: {
      cardId: recoveredCardId,
      amount: 12,
      currency: "USD",
      merchantName,
      merchantCategoryCode,
    },
  });
  providerCalls += 1;
  const authorizeParsed = simulatedTransactionResponseSchema.safeParse(authorizeResponse.payload);
  if (!authorizeResponse.ok || !authorizeParsed.success) {
    await appendDurableOperationState({
      store,
      scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
      draft: draft("authorize", {
        occurredAt: new Date().toISOString(),
        state: "ambiguous",
        truthBoundary: "provider-ambiguous",
        providerHttpStatus: authorizeResponse.status,
        responseShape: authorizeResponse.responseShape,
        authoritativeReadback: {
          state: "unavailable",
          observedAt: new Date().toISOString(),
          providerState: "unknown",
          matchCodes: [],
        },
        evidenceCodes: ["AUTHORIZATION_UNCONFIRMED", "NO_AUTOMATIC_RETRY"],
      }),
    });
    throw new RainNorthstarProofError("RAIN_AUTHORIZATION_UNCONFIRMED", 502, providerCalls);
  }
  const transactionId = authorizeParsed.data.transactionId;
  const transactionContext = fingerprintFor("authorize");
  const transactionEnvelope = encryptRecoveryReference({
    kind: "rain_transaction_id",
    rawReference: transactionId,
    contextFingerprint: transactionContext,
    encodedKey: config.RECOVERY_ENCRYPTION_KEY,
  });
  if (authorizeParsed.data.status !== "authorized") {
    await appendDurableOperationState({
      store,
      scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
      draft: draft("authorize", {
        occurredAt: new Date().toISOString(),
        state: "provider-declined",
        truthBoundary: "provider-declined",
        providerHttpStatus: authorizeResponse.status,
        providerCorrelationRef: maskProviderReference("rain_transaction", transactionId),
        responseShape: authorizeResponse.responseShape,
        recoveryEnvelope: transactionEnvelope,
        authoritativeReadback: {
          state: "not-required",
          providerState: "declined",
          matchCodes: [],
        },
        evidenceCodes: ["AUTHORIZATION_DECLINED", "SETTLEMENT_BLOCKED"],
      }),
    });
    throw new RainNorthstarProofError("RAIN_AUTHORIZATION_DECLINED", 409, providerCalls);
  }
  await appendDurableOperationState({
    store,
    scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
    draft: draft("authorize", {
      occurredAt: new Date().toISOString(),
      state: "provider-accepted",
      truthBoundary: "sandbox-unconfirmed",
      providerHttpStatus: authorizeResponse.status,
      providerCorrelationRef: maskProviderReference("rain_transaction", transactionId),
      responseShape: authorizeResponse.responseShape,
      recoveryEnvelope: transactionEnvelope,
      authoritativeReadback: {
        state: "not-started",
        providerState: "authorized",
        matchCodes: [],
      },
      evidenceCodes: ["AUTHORIZATION_RESPONSE_VALIDATED", "ENCRYPTED_RECOVERY_REFERENCE_STORED"],
    }),
  });

  const authorizationReadback = await providerCall({
    config,
    fetchImpl,
    method: "GET",
    path: `/issuing/transactions/${encodeURIComponent(transactionId)}`,
  });
  providerCalls += 1;
  readbackCalls += 1;
  const authorizationReadbackParsed = spendReadbackResponseSchema.safeParse(authorizationReadback.payload);
  if (
    !authorizationReadback.ok ||
    !authorizationReadbackParsed.success ||
    !requireExactSpend({
      payload: authorizationReadbackParsed.data,
      transactionId,
      cardId: recoveredCardId,
      userId: config.RAIN_USER_ID,
    }) ||
    authorizationReadbackParsed.data.spend.status !== "pending"
  ) {
    await appendDurableOperationState({
      store,
      scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
      draft: draft("authorize", {
        occurredAt: new Date().toISOString(),
        state: "ambiguous",
        truthBoundary: "provider-ambiguous",
        providerHttpStatus: authorizationReadback.status,
        responseShape: authorizationReadback.responseShape,
        authoritativeReadback: {
          state: "ambiguous",
          observedAt: new Date().toISOString(),
          providerState: "unknown",
          matchCodes: [],
        },
        evidenceCodes: ["AUTHORIZATION_READBACK_MISMATCH", "SETTLEMENT_BLOCKED"],
      }),
    });
    throw new RainNorthstarProofError("RAIN_AUTHORIZATION_READBACK_MISMATCH", 502, providerCalls);
  }
  await appendDurableOperationState({
    store,
    scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
    draft: draft("authorize", {
      occurredAt: new Date().toISOString(),
      state: "provider-pending",
      truthBoundary: "sandbox-unconfirmed",
      providerHttpStatus: authorizationReadback.status,
      providerCorrelationRef: maskProviderReference("rain_transaction", transactionId),
      responseShape: authorizationReadback.responseShape,
      authoritativeReadback: {
        state: "matched-nonterminal",
        observedAt: new Date().toISOString(),
        providerState: "authorized",
        matchCodes: [
          "TRANSACTION_ID_MATCH",
          "CARD_ID_MATCH",
          "USER_ID_MATCH",
          "AMOUNT_12_USD_CENTS_MATCH",
          "MERCHANT_MATCH",
          "MCC_5734_MATCH",
          "STATUS_PENDING",
        ],
      },
      evidenceCodes: ["AUTHORIZATION_READBACK_MATCHED", "SETTLEMENT_PERMITTED"],
    }),
  });

  await claim("settle", store);
  const journalWithTransaction = await store.read(RAIN_NORTHSTAR_RUN_SCOPE);
  const storedTransactionEnvelope = recoveryEnvelope(journalWithTransaction, "rain_transaction_id");
  if (!storedTransactionEnvelope) throw new RainNorthstarProofError("RAIN_RECOVERY_UNAVAILABLE", 503, providerCalls);
  const recoveredTransactionId = decryptRecoveryReference({
    envelope: storedTransactionEnvelope,
    expectedKind: "rain_transaction_id",
    expectedContextFingerprint: transactionContext,
    encodedKey: config.RECOVERY_ENCRYPTION_KEY,
  });
  const settlementResponse = await providerCall({
    config,
    fetchImpl,
    method: "POST",
    path: `/simulate/transactions/${encodeURIComponent(recoveredTransactionId)}/settle`,
    idempotencyKey: providerIdempotencyKey(
      "rain.settle_transaction",
      fingerprintFor("settle"),
      config.RECOVERY_ENCRYPTION_KEY,
    ),
    body: {},
  });
  providerCalls += 1;
  const settlementParsed = simulatedTransactionResponseSchema.safeParse(settlementResponse.payload);
  const settlementResponseMatched =
    settlementResponse.ok &&
    settlementParsed.success &&
    settlementParsed.data.transactionId === recoveredTransactionId &&
    settlementParsed.data.status === "settled" &&
    settlementParsed.data.completionReason === "SETTLEMENT";
  const settlement400Code =
    settlementResponse.status === 400
      ? classifySettlement400(settlementResponse.payload)
      : undefined;
  const settlementRejected =
    settlementResponse.status === 400 &&
    settlement400Code !== "SETTLE_400_UNRECOGNIZED";
  await appendDurableOperationState({
    store,
    scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
    draft: draft("settle", {
      occurredAt: new Date().toISOString(),
      state: settlementResponseMatched ? "provider-accepted" : "readback-pending",
      truthBoundary: settlementResponseMatched
        ? "sandbox-unconfirmed"
        : settlementRejected
          ? "provider-failed"
          : "provider-ambiguous",
      providerHttpStatus: settlementResponse.status,
      providerCorrelationRef: maskProviderReference("rain_transaction", recoveredTransactionId),
      responseShape: settlementResponse.responseShape,
      authoritativeReadback: {
        state: settlementResponseMatched ? "pending" : "ambiguous",
        observedAt: new Date().toISOString(),
        providerState: settlementResponseMatched ? "settlement-pending" : "unknown",
        matchCodes: settlementResponseMatched
          ? ["SETTLEMENT_RESPONSE_MATCHED"]
          : [],
      },
      evidenceCodes: settlementResponseMatched
        ? ["SETTLEMENT_RESPONSE_VALIDATED", "DIRECT_READBACK_REQUIRED"]
        : [
            ...(settlement400Code ? [settlement400Code] : []),
            settlementRejected
              ? "SETTLEMENT_PROVIDER_REJECTED"
              : "SETTLEMENT_RESPONSE_AMBIGUOUS",
            "DIRECT_READBACK_REQUIRED",
          ],
    }),
  });

  let finalReadback: ProviderCall | undefined;
  let finalParsed: z.infer<typeof spendReadbackResponseSchema> | undefined;
  for (let readAttempt = 0; readAttempt < 3; readAttempt += 1) {
    finalReadback = await providerCall({
      config,
      fetchImpl,
      method: "GET",
      path: `/issuing/transactions/${encodeURIComponent(recoveredTransactionId)}`,
    });
    providerCalls += 1;
    readbackCalls += 1;
    const parsedReadback = spendReadbackResponseSchema.safeParse(finalReadback.payload);
    if (parsedReadback.success) {
      finalParsed = parsedReadback.data;
      if (finalParsed.spend.status !== "pending") break;
    } else {
      break;
    }
  }

  if (
    !finalReadback ||
    !finalReadback.ok ||
    !finalParsed ||
    !requireExactSpend({
      payload: finalParsed,
      transactionId: recoveredTransactionId,
      cardId: recoveredCardId,
      userId: config.RAIN_USER_ID,
    }) ||
    finalParsed.spend.status !== "completed"
  ) {
    await appendDurableOperationState({
      store,
      scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
      draft: draft("settle", {
        occurredAt: new Date().toISOString(),
        state: "ambiguous",
        truthBoundary: "provider-ambiguous",
        ...(finalReadback ? { providerHttpStatus: finalReadback.status, responseShape: finalReadback.responseShape } : {}),
        authoritativeReadback: {
          state: finalParsed ? "matched-nonterminal" : "ambiguous",
          observedAt: new Date().toISOString(),
          providerState: finalParsed?.spend.status === "pending" ? "settlement-pending" : "unknown",
          matchCodes: finalParsed ? ["TERMINAL_COMPLETED_STATUS_MISSING"] : [],
        },
        evidenceCodes: ["FINAL_SPEND_READBACK_UNCONFIRMED", "NO_SETTLEMENT_CLAIM"],
      }),
    });
    throw new RainNorthstarProofError("RAIN_FINAL_READBACK_UNCONFIRMED", 502, providerCalls);
  }

  const completed = await appendDurableOperationState({
    store,
    scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
    draft: draft("settle", {
      occurredAt: new Date().toISOString(),
      state: "provider-confirmed",
      truthBoundary: "sandbox-authoritative",
      providerHttpStatus: finalReadback.status,
      providerCorrelationRef: maskProviderReference("rain_transaction", recoveredTransactionId),
      responseShape: finalReadback.responseShape,
      authoritativeReadback: {
        state: "matched-terminal",
        observedAt: new Date().toISOString(),
        providerState: "completed",
        matchCodes: [
          "TRANSACTION_ID_MATCH",
          "CARD_ID_MATCH",
          "USER_ID_MATCH",
          "AMOUNT_12_USD_CENTS_MATCH",
          "MERCHANT_MATCH",
          "MCC_5734_MATCH",
          "CARD_TYPE_VIRTUAL",
          "STATUS_COMPLETED",
        ],
      },
      evidenceCodes: [
        "RAIN_SANDBOX_SIMULATED_SPEND_COMPLETED",
        "DIRECT_TRANSACTION_READBACK",
        "NO_REAL_FUNDS",
      ],
    }),
  });

  return {
    receipt: buildAuditReceipt(
      {
        receiptId: RAIN_NORTHSTAR_PROOF_RECEIPT_ID,
        generatedAt: completed.entry.occurredAt,
      },
      completed.journal,
    ),
    providerCalls,
    mutationCalls: 3,
    readbackCalls,
    paymentClaim: "rain-sandbox-simulated-spend-completed",
    fundingClaim: "prior-funding-remains-uncorrelated",
    cardLimitClaim,
    truthBoundary: "sandbox-authoritative",
  };
}

export async function readRainNorthstarProof(
  source: Record<string, string | undefined> = process.env,
  store: DurableOperationJournalStore = createRuntimeOperationJournalStore(source),
): Promise<RainNorthstarProofResult | null> {
  let journal: readonly OperationJournalEntry[];
  try {
    journal = await store.read(RAIN_NORTHSTAR_RUN_SCOPE);
  } catch {
    throw new RainNorthstarProofError("RAIN_JOURNAL_UNAVAILABLE", 503);
  }
  const completed = [...journal]
    .reverse()
    .find(
      (entry) =>
        entry.operation === "rain.settle_transaction" &&
        entry.state === "provider-confirmed" &&
        entry.authoritativeReadback.state === "matched-terminal" &&
        entry.authoritativeReadback.providerState === "completed",
    );
  if (!completed) return null;
  const card = [...journal]
    .reverse()
    .find((entry) => entry.operation === "rain.issue_scoped_card" && entry.state === "provider-confirmed");
  const cardCodes = card?.authoritativeReadback.matchCodes ?? [];
  return {
    receipt: buildAuditReceipt(
      {
        receiptId: RAIN_NORTHSTAR_PROOF_RECEIPT_ID,
        generatedAt: completed.occurredAt,
      },
      journal,
    ),
    providerCalls: 0,
    mutationCalls: 3,
    readbackCalls: 0,
    paymentClaim: "rain-sandbox-simulated-spend-completed",
    fundingClaim: "prior-funding-remains-uncorrelated",
    cardLimitClaim: cardCodes.includes("CAP_READBACK_MATCH")
      ? "direct-readback-match"
      : cardCodes.includes("CAP_READBACK_DIFFERENT")
        ? "direct-readback-different"
        : "request-only",
    truthBoundary: "sandbox-authoritative",
  };
}

export async function readRainNorthstarAttemptReceipt(
  source: Record<string, string | undefined> = process.env,
  store: DurableOperationJournalStore = createRuntimeOperationJournalStore(source),
): Promise<AuditReceipt | null> {
  const journal = await store.read(RAIN_NORTHSTAR_RUN_SCOPE);
  if (journal.length === 0) return null;
  return buildAuditReceipt(
    {
      receiptId: RAIN_NORTHSTAR_PROOF_RECEIPT_ID,
      generatedAt: journal.at(-1)!.occurredAt,
    },
    journal,
  );
}

function openProviderState(status: string) {
  return status === "pending" || status === "authorized";
}

function normalizedProviderState(status: string) {
  if (status === "completed") return "completed" as const;
  if (openProviderState(status)) return "authorized" as const;
  if (status === "declined") return "declined" as const;
  if (status === "reversed") return "failed" as const;
  return "unknown" as const;
}

function statusEvidenceCode(status: string) {
  if (status === "pending") return "STATUS_PENDING";
  if (status === "authorized") return "STATUS_AUTHORIZED";
  if (status === "completed") return "STATUS_COMPLETED";
  if (status === "declined") return "STATUS_DECLINED";
  if (status === "reversed") return "STATUS_REVERSED";
  return "STATUS_UNRECOGNIZED";
}

async function durableStoreFor(
  source: Record<string, string | undefined>,
  supplied?: DurableOperationJournalStore,
) {
  let store: DurableOperationJournalStore;
  try {
    store = supplied ?? createRuntimeOperationJournalStore(source);
  } catch {
    throw new RainNorthstarProofError("RAIN_JOURNAL_UNAVAILABLE", 503);
  }
  if (store.durability !== "durable") {
    throw new RainNorthstarProofError("RAIN_RECONCILIATION_UNAVAILABLE", 503);
  }
  return store;
}

async function recoverRainNorthstarReferences(input: {
  store: DurableOperationJournalStore;
  encodedKey: string;
}) {
  let journal: readonly OperationJournalEntry[];
  try {
    journal = await input.store.read(RAIN_NORTHSTAR_RUN_SCOPE);
  } catch {
    throw new RainNorthstarProofError("RAIN_JOURNAL_UNAVAILABLE", 503);
  }
  const cardEnvelope = recoveryEnvelope(journal, "rain_card_id");
  const transactionEnvelope = recoveryEnvelope(journal, "rain_transaction_id");
  if (!cardEnvelope || !transactionEnvelope) {
    throw new RainNorthstarProofError("RAIN_RECOVERY_UNAVAILABLE", 503);
  }
  try {
    return {
      journal,
      cardId: decryptRecoveryReference({
        envelope: cardEnvelope,
        expectedKind: "rain_card_id",
        expectedContextFingerprint: fingerprintFor("card"),
        encodedKey: input.encodedKey,
      }),
      transactionId: decryptRecoveryReference({
        envelope: transactionEnvelope,
        expectedKind: "rain_transaction_id",
        expectedContextFingerprint: fingerprintFor("authorize"),
        encodedKey: input.encodedKey,
      }),
    };
  } catch {
    throw new RainNorthstarProofError("RAIN_RECOVERY_UNAVAILABLE", 503);
  }
}

export async function inspectRainNorthstarRecoveryContinuity(input: {
  source?: Record<string, string | undefined>;
  store?: DurableOperationJournalStore;
}) {
  const source = input.source ?? process.env;
  const baseReady =
    source.VERCEL_ENV === "preview" &&
    Boolean(source.DATABASE_URL?.trim()) &&
    z.string().uuid().safeParse(source.RAIN_USER_ID).success &&
    Boolean(
      source.RECOVERY_ENCRYPTION_KEY &&
        Buffer.from(source.RECOVERY_ENCRYPTION_KEY, "base64").length === 32,
    );
  if (!baseReady) {
    return {
      journalReachable: false,
      cardEnvelopePresent: false,
      transactionEnvelopePresent: false,
      cardDecryptable: false,
      transactionDecryptable: false,
      keyFingerprintMatched: false,
      ready: false,
    } as const;
  }
  try {
    const store = await durableStoreFor(source, input.store);
    const journal = await store.read(RAIN_NORTHSTAR_RUN_SCOPE);
    const cardEnvelope = recoveryEnvelope(journal, "rain_card_id");
    const transactionEnvelope = recoveryEnvelope(journal, "rain_transaction_id");
    let cardDecryptable = false;
    let transactionDecryptable = false;
    if (cardEnvelope) {
      try {
        decryptRecoveryReference({
          envelope: cardEnvelope,
          expectedKind: "rain_card_id",
          expectedContextFingerprint: fingerprintFor("card"),
          encodedKey: source.RECOVERY_ENCRYPTION_KEY!,
        });
        cardDecryptable = true;
      } catch {}
    }
    if (transactionEnvelope) {
      try {
        decryptRecoveryReference({
          envelope: transactionEnvelope,
          expectedKind: "rain_transaction_id",
          expectedContextFingerprint: fingerprintFor("authorize"),
          encodedKey: source.RECOVERY_ENCRYPTION_KEY!,
        });
        transactionDecryptable = true;
      } catch {}
    }
    const ready = cardDecryptable && transactionDecryptable;
    return {
      journalReachable: true,
      cardEnvelopePresent: Boolean(cardEnvelope),
      transactionEnvelopePresent: Boolean(transactionEnvelope),
      cardDecryptable,
      transactionDecryptable,
      keyFingerprintMatched: ready,
      ready,
    } as const;
  } catch {
    return {
      journalReachable: false,
      cardEnvelopePresent: false,
      transactionEnvelopePresent: false,
      cardDecryptable: false,
      transactionDecryptable: false,
      keyFingerprintMatched: false,
      ready: false,
    } as const;
  }
}

async function claimResumeRead(store: DurableOperationJournalStore) {
  const current = await store.read(RAIN_NORTHSTAR_RUN_SCOPE);
  if (current.some((entry) => entry.operationRef === resumeReadOperationRef)) {
    throw new RainNorthstarProofError("RAIN_RECONCILIATION_ALREADY_CLAIMED", 409);
  }
  try {
    await appendDurableOperationState({
      store,
      scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
      draft: resumeReadDraft({
        occurredAt: new Date().toISOString(),
        state: "submitted",
        truthBoundary: "sandbox-unconfirmed",
        authoritativeReadback: {
          state: "not-started",
          providerState: "not-observed",
          matchCodes: [],
        },
        evidenceCodes: [
          "DURABLE_READ_CLAIM",
          "ONE_ATTEMPT_GATE",
          "NO_PROVIDER_MUTATION",
        ],
      }),
    });
  } catch (error) {
    const refreshed = await store.read(RAIN_NORTHSTAR_RUN_SCOPE);
    if (refreshed.some((entry) => entry.operationRef === resumeReadOperationRef)) {
      throw new RainNorthstarProofError("RAIN_RECONCILIATION_ALREADY_CLAIMED", 409);
    }
    throw error;
  }
}

async function performClaimedReconciliationRead(input: {
  config: z.infer<typeof reconciliationEnvironmentSchema>;
  store: DurableOperationJournalStore;
  fetchImpl: typeof globalThis.fetch;
  cardId: string;
  transactionId: string;
}) {
  await claimResumeRead(input.store);
  let readback: ProviderCall;
  try {
    readback = await providerCall({
      config: input.config,
      fetchImpl: input.fetchImpl,
      method: "GET",
      path: `/issuing/transactions/${encodeURIComponent(input.transactionId)}`,
    });
  } catch (error) {
    await appendDurableOperationState({
      store: input.store,
      scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
      draft: resumeReadDraft({
        occurredAt: new Date().toISOString(),
        state: "ambiguous",
        truthBoundary: "provider-ambiguous",
        authoritativeReadback: {
          state: "unavailable",
          observedAt: new Date().toISOString(),
          providerState: "unknown",
          matchCodes: [],
        },
        evidenceCodes: ["RECONCILIATION_TRANSPORT_AMBIGUOUS", "SETTLEMENT_BLOCKED"],
      }),
    });
    throw error;
  }

  const parsed = spendReadbackResponseSchema.safeParse(readback.payload);
  if (!readback.ok || !parsed.success) {
    await appendDurableOperationState({
      store: input.store,
      scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
      draft: resumeReadDraft({
        occurredAt: new Date().toISOString(),
        state: "ambiguous",
        truthBoundary: "provider-ambiguous",
        providerHttpStatus: readback.status,
        responseShape: readback.responseShape,
        authoritativeReadback: {
          state: "unavailable",
          observedAt: new Date().toISOString(),
          providerState: "unknown",
          matchCodes: [],
        },
        evidenceCodes: ["RECONCILIATION_SCHEMA_UNCONFIRMED", "SETTLEMENT_BLOCKED"],
      }),
    });
    throw new RainNorthstarProofError(
      "RAIN_RECONCILIATION_UNAVAILABLE",
      502,
      1,
    );
  }

  const evaluation = evaluateExactSpend({
    payload: parsed.data,
    transactionId: input.transactionId,
    cardId: input.cardId,
    userId: input.config.RAIN_USER_ID,
  });
  const status = parsed.data.spend.status;
  const terminal = evaluation.matchesAllCausalFields && status === "completed";
  const open = evaluation.matchesAllCausalFields && openProviderState(status);
  const matchCodes = [...evaluation.matchCodes, statusEvidenceCode(status)];
  const appended = await appendDurableOperationState({
    store: input.store,
    scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
    draft: resumeReadDraft({
      occurredAt: new Date().toISOString(),
      state: terminal ? "provider-confirmed" : open ? "provider-pending" : "ambiguous",
      truthBoundary: terminal
        ? "sandbox-authoritative"
        : open
          ? "sandbox-unconfirmed"
          : "provider-ambiguous",
      providerHttpStatus: readback.status,
      providerCorrelationRef: maskProviderReference(
        "rain_transaction",
        input.transactionId,
      ),
      responseShape: readback.responseShape,
      authoritativeReadback: {
        state: terminal
          ? "matched-terminal"
          : open
            ? "matched-nonterminal"
            : "ambiguous",
        observedAt: new Date().toISOString(),
        providerState: normalizedProviderState(status),
        matchCodes,
      },
      evidenceCodes: terminal
        ? ["RECONCILIATION_COMPLETED", "NO_SETTLEMENT_CALL_REQUIRED"]
        : open
          ? [
              "RECONCILIATION_MATCHED_OPEN_TRANSACTION",
              evaluation.amountEncoding === "observed-major-units"
                ? "OBSERVED_MAJOR_UNIT_AMOUNT_VARIANT"
                : "DOCUMENTED_MINOR_UNIT_AMOUNT",
            ]
          : ["RECONCILIATION_FIELD_OR_STATUS_MISMATCH", "SETTLEMENT_BLOCKED"],
    }),
  });
  return {
    parsed: parsed.data,
    readback,
    evaluation,
    matchCodes,
    terminal,
    open,
    journal: appended.journal,
    entry: appended.entry,
  };
}

function parseReconciliationInput(input: {
  attemptId: string | null;
  source?: Record<string, string | undefined>;
  requireSettlement: boolean;
}) {
  const source = input.source ?? process.env;
  const schema = input.requireSettlement
    ? resumeEnvironmentSchema
    : reconciliationEnvironmentSchema;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new RainNorthstarProofError("RAIN_RECONCILIATION_UNAVAILABLE", 503);
  }
  if (
    !input.attemptId ||
    !exactValue(
      input.attemptId,
      parsed.data.RAIN_NORTHSTAR_RECONCILIATION_ATTEMPT_ID,
    )
  ) {
    throw new RainNorthstarProofError("RAIN_RECONCILIATION_UNAUTHORIZED", 401);
  }
  return { source, config: parsed.data };
}

export async function reconcileRainNorthstarAuthorization(input: {
  attemptId: string | null;
  source?: Record<string, string | undefined>;
  store?: DurableOperationJournalStore;
  fetchImpl?: typeof globalThis.fetch;
}) {
  const { source, config } = parseReconciliationInput({
    ...input,
    requireSettlement: false,
  });
  const store = await durableStoreFor(source, input.store);
  const recovered = await recoverRainNorthstarReferences({
    store,
    encodedKey: config.RECOVERY_ENCRYPTION_KEY,
  });
  const reconciled = await performClaimedReconciliationRead({
    config,
    store,
    fetchImpl: input.fetchImpl ?? globalThis.fetch,
    cardId: recovered.cardId,
    transactionId: recovered.transactionId,
  });
  return {
    providerCalls: 1,
    mutationCalls: 0,
    status: reconciled.parsed.spend.status,
    matchesAllCausalFields: reconciled.evaluation.matchesAllCausalFields,
    matchCodes: reconciled.matchCodes,
    transactionReference: maskProviderReference(
      "rain_transaction",
      recovered.transactionId,
    ),
    cardReference: maskProviderReference("rain_card", recovered.cardId),
    responseShape: reconciled.readback.responseShape,
    truthBoundary: reconciled.terminal
      ? "sandbox-authoritative"
      : reconciled.open
        ? "sandbox-unconfirmed"
        : "provider-ambiguous",
    receipt: buildAuditReceipt(
      {
        receiptId: RAIN_NORTHSTAR_PROOF_RECEIPT_ID,
        generatedAt: reconciled.entry.occurredAt,
      },
      reconciled.journal,
    ),
  } as const;
}

export async function executeRainNorthstarResume(input: {
  attemptId: string | null;
  source?: Record<string, string | undefined>;
  store?: DurableOperationJournalStore;
  fetchImpl?: typeof globalThis.fetch;
}) {
  const { source, config } = parseReconciliationInput({
    ...input,
    requireSettlement: true,
  });
  const store = await durableStoreFor(source, input.store);
  const recovered = await recoverRainNorthstarReferences({
    store,
    encodedKey: config.RECOVERY_ENCRYPTION_KEY,
  });
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  let providerCalls = 0;
  let readbackCalls = 0;
  const reconciled = await performClaimedReconciliationRead({
    config,
    store,
    fetchImpl,
    cardId: recovered.cardId,
    transactionId: recovered.transactionId,
  });
  providerCalls += 1;
  readbackCalls += 1;

  if (reconciled.terminal) {
    return {
      providerCalls,
      mutationCalls: 0,
      readbackCalls,
      paymentClaim: "rain-sandbox-simulated-spend-completed",
      fundingClaim: "prior-funding-remains-uncorrelated",
      amountEncoding: reconciled.evaluation.amountEncoding,
      truthBoundary: "sandbox-authoritative",
      receipt: buildAuditReceipt(
        {
          receiptId: RAIN_NORTHSTAR_PROOF_RECEIPT_ID,
          generatedAt: reconciled.entry.occurredAt,
        },
        reconciled.journal,
      ),
    } as const;
  }
  if (!reconciled.open) {
    throw new RainNorthstarProofError("RAIN_RECONCILIATION_MISMATCH", 409, providerCalls);
  }

  await claim("settle", store);
  let settlementResponse: ProviderCall;
  try {
    settlementResponse = await providerCall({
      config,
      fetchImpl,
      method: "POST",
      path: `/simulate/transactions/${encodeURIComponent(recovered.transactionId)}/settle`,
      idempotencyKey: providerIdempotencyKey(
        "rain.settle_transaction",
        fingerprintFor("settle"),
        config.RECOVERY_ENCRYPTION_KEY,
      ),
      body: {},
    });
    providerCalls += 1;
  } catch {
    providerCalls += 1;
    await appendDurableOperationState({
      store,
      scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
      draft: draft("settle", {
        occurredAt: new Date().toISOString(),
        state: "ambiguous",
        truthBoundary: "provider-ambiguous",
        authoritativeReadback: {
          state: "unavailable",
          observedAt: new Date().toISOString(),
          providerState: "unknown",
          matchCodes: [],
        },
        evidenceCodes: ["SETTLEMENT_TRANSPORT_AMBIGUOUS", "NO_MUTATION_RETRY"],
      }),
    });
    throw new RainNorthstarProofError("RAIN_SETTLEMENT_AMBIGUOUS", 502, providerCalls);
  }
  const settlementParsed = simulatedTransactionResponseSchema.safeParse(
    settlementResponse.payload,
  );
  const settlementResponseMatched =
    settlementResponse.ok &&
    settlementParsed.success &&
    settlementParsed.data.transactionId === recovered.transactionId &&
    settlementParsed.data.status === "settled" &&
    settlementParsed.data.completionReason === "SETTLEMENT";
  const settlement400Code =
    settlementResponse.status === 400
      ? classifySettlement400(settlementResponse.payload)
      : undefined;
  const settlementRejected =
    settlementResponse.status === 400 &&
    settlement400Code !== "SETTLE_400_UNRECOGNIZED";
  await appendDurableOperationState({
    store,
    scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
    draft: draft("settle", {
      occurredAt: new Date().toISOString(),
      state: settlementResponseMatched ? "provider-accepted" : "readback-pending",
      truthBoundary: settlementResponseMatched
        ? "sandbox-unconfirmed"
        : settlementRejected
          ? "provider-failed"
          : "provider-ambiguous",
      providerHttpStatus: settlementResponse.status,
      providerCorrelationRef: maskProviderReference(
        "rain_transaction",
        recovered.transactionId,
      ),
      responseShape: settlementResponse.responseShape,
      authoritativeReadback: {
        state: settlementResponseMatched ? "pending" : "ambiguous",
        observedAt: new Date().toISOString(),
        providerState: settlementResponseMatched ? "settlement-pending" : "unknown",
        matchCodes: settlementResponseMatched
          ? ["SETTLEMENT_RESPONSE_MATCHED"]
          : [],
      },
      evidenceCodes: settlementResponseMatched
        ? ["SETTLEMENT_RESPONSE_VALIDATED", "DIRECT_READBACK_REQUIRED"]
        : [
            ...(settlement400Code ? [settlement400Code] : []),
            settlementRejected
              ? "SETTLEMENT_PROVIDER_REJECTED"
              : "SETTLEMENT_RESPONSE_AMBIGUOUS",
            "NO_MUTATION_RETRY",
          ],
    }),
  });

  let lastReadback: ProviderCall | undefined;
  let lastParsed: ParsedSpendReadback | undefined;
  let lastEvaluation: ReturnType<typeof evaluateExactSpend> | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    lastReadback = await providerCall({
      config,
      fetchImpl,
      method: "GET",
      path: `/issuing/transactions/${encodeURIComponent(recovered.transactionId)}`,
    });
    providerCalls += 1;
    readbackCalls += 1;
    const parsed = spendReadbackResponseSchema.safeParse(lastReadback.payload);
    if (!lastReadback.ok || !parsed.success) break;
    lastParsed = parsed.data;
    lastEvaluation = evaluateExactSpend({
      payload: parsed.data,
      transactionId: recovered.transactionId,
      cardId: recovered.cardId,
      userId: config.RAIN_USER_ID,
    });
    if (parsed.data.spend.status !== "pending") break;
  }

  const completed =
    Boolean(lastReadback?.ok) &&
    Boolean(lastParsed) &&
    Boolean(lastEvaluation?.matchesAllCausalFields) &&
    lastParsed?.spend.status === "completed";
  if (!completed || !lastReadback || !lastParsed || !lastEvaluation) {
    await appendDurableOperationState({
      store,
      scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
      draft: draft("settle", {
        occurredAt: new Date().toISOString(),
        state: "ambiguous",
        truthBoundary: "provider-ambiguous",
        ...(lastReadback
          ? {
              providerHttpStatus: lastReadback.status,
              responseShape: lastReadback.responseShape,
            }
          : {}),
        authoritativeReadback: {
          state: lastEvaluation?.matchesAllCausalFields
            ? "matched-nonterminal"
            : "ambiguous",
          observedAt: new Date().toISOString(),
          providerState: lastParsed
            ? normalizedProviderState(lastParsed.spend.status)
            : "unknown",
          matchCodes: lastParsed && lastEvaluation
            ? [...lastEvaluation.matchCodes, statusEvidenceCode(lastParsed.spend.status)]
            : [],
        },
        evidenceCodes: ["FINAL_SPEND_READBACK_UNCONFIRMED", "NO_MUTATION_RETRY"],
      }),
    });
    throw new RainNorthstarProofError(
      "RAIN_FINAL_READBACK_UNCONFIRMED",
      502,
      providerCalls,
    );
  }

  const confirmed = await appendDurableOperationState({
    store,
    scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
    draft: draft("settle", {
      occurredAt: new Date().toISOString(),
      state: "provider-confirmed",
      truthBoundary: "sandbox-authoritative",
      providerHttpStatus: lastReadback.status,
      providerCorrelationRef: maskProviderReference(
        "rain_transaction",
        recovered.transactionId,
      ),
      responseShape: lastReadback.responseShape,
      authoritativeReadback: {
        state: "matched-terminal",
        observedAt: new Date().toISOString(),
        providerState: "completed",
        matchCodes: [
          ...lastEvaluation.matchCodes,
          "STATUS_COMPLETED",
        ],
      },
      evidenceCodes: [
        "RAIN_SANDBOX_SIMULATED_SPEND_COMPLETED",
        "DIRECT_TRANSACTION_READBACK",
        lastEvaluation.amountEncoding === "observed-major-units"
          ? "OBSERVED_MAJOR_UNIT_AMOUNT_VARIANT"
          : "DOCUMENTED_MINOR_UNIT_AMOUNT",
        "NO_REAL_FUNDS",
      ],
    }),
  });
  return {
    providerCalls,
    mutationCalls: 1,
    readbackCalls,
    paymentClaim: "rain-sandbox-simulated-spend-completed",
    fundingClaim: "prior-funding-remains-uncorrelated",
    amountEncoding: lastEvaluation.amountEncoding,
    truthBoundary: "sandbox-authoritative",
    receipt: buildAuditReceipt(
      {
        receiptId: RAIN_NORTHSTAR_PROOF_RECEIPT_ID,
        generatedAt: confirmed.entry.occurredAt,
      },
      confirmed.journal,
    ),
  } as const;
}
