import { appendOperationEntry } from "./journal";
import { buildAuditReceipt } from "./receipt";
import {
  maskedReferenceSchema,
  safeResponseShapeSchema,
  type AuditReceipt,
  type OperationEntryDraft,
  type OperationJournalEntry,
} from "./schemas";

export const RAIN_CARD_AUDIT_RECEIPT_ID =
  "audit_rain_card_20260808_v2";

const operationRef = "op_rain_card_issue_20260808_v2";
const idempotencyFingerprint =
  "sha256:983ca5a1182877be3a0436ca861d026b0be642848a2cea3830cfc901ce96a8e1" as const;
const maskedCardReference = maskedReferenceSchema.parse("card:4432...fe71");
const amount = {
  amount: "12",
  decimals: 2,
  asset: "USDC" as const,
  network: "rain-sandbox" as const,
};

const issueResponseShape = safeResponseShapeSchema.parse({
  rootType: "object",
  fields: [
    { path: "id", type: "string" },
    { path: "last4", type: "string" },
    { path: "expirationMonth", type: "string" },
    { path: "expirationYear", type: "string" },
    { path: "status", type: "string" },
  ],
  omittedSensitiveFieldCount: 2,
  truncated: false,
});

const cardReadbackShape = safeResponseShapeSchema.parse({
  rootType: "object",
  fields: [
    { path: "id", type: "string" },
    { path: "userId", type: "string" },
    { path: "type", type: "string" },
    { path: "status", type: "string" },
    { path: "last4", type: "string" },
    { path: "expirationMonth", type: "string" },
    { path: "expirationYear", type: "string" },
    { path: "limit", type: "object" },
    { path: "limit.amount", type: "number" },
    { path: "limit.frequency", type: "string" },
    { path: "configuration", type: "object" },
    { path: "configuration.currency", type: "string" },
    { path: "tokenWallets", type: "array" },
    { path: "createdAt", type: "string" },
    { path: "updatedAt", type: "string" },
  ],
  omittedSensitiveFieldCount: 0,
  truncated: false,
});

function append(
  entries: readonly OperationJournalEntry[],
  input: Pick<
    OperationEntryDraft,
    | "occurredAt"
    | "state"
    | "truthBoundary"
    | "authoritativeReadback"
    | "evidenceCodes"
  > &
    Partial<
      Pick<
        OperationEntryDraft,
        "providerHttpStatus" | "providerCorrelationRef" | "responseShape"
      >
    >,
): OperationJournalEntry[] {
  return appendOperationEntry(entries, {
    operationRef,
    provider: "rain",
    mode: "live-sandbox",
    operation: "rain.issue_scoped_card",
    endpoint: "/issuing/users/{userId}/cards/scoped",
    mutation: true,
    idempotencyFingerprint,
    amount,
    ...input,
  });
}

export function buildRainCardAuditReceipt(): AuditReceipt {
  let entries: OperationJournalEntry[] = [];
  entries = append(entries, {
    occurredAt: "2026-08-08T23:37:53.975Z",
    state: "planned",
    truthBoundary: "sandbox-unconfirmed",
    authoritativeReadback: {
      state: "not-started",
      providerState: "not-observed",
      matchCodes: [],
    },
    evidenceCodes: ["OPERATION_PLANNED"],
  });
  entries = append(entries, {
    occurredAt: "2026-08-08T23:37:53.975Z",
    state: "gate-passed",
    truthBoundary: "sandbox-unconfirmed",
    authoritativeReadback: {
      state: "not-started",
      providerState: "not-observed",
      matchCodes: [],
    },
    evidenceCodes: ["GUARD_ALLOWED", "ONE_ATTEMPT_GATE"],
  });
  entries = append(entries, {
    occurredAt: "2026-08-08T23:37:53.975Z",
    state: "submitted",
    truthBoundary: "sandbox-unconfirmed",
    authoritativeReadback: {
      state: "not-started",
      providerState: "not-observed",
      matchCodes: [],
    },
    evidenceCodes: [
      "MUTATION_SUBMITTED",
      "CAP_12_USDC_CENTS_REQUESTED",
      "CAP_REQUEST_ONLY",
    ],
  });
  entries = append(entries, {
    occurredAt: "2026-08-08T23:37:57.472Z",
    state: "provider-accepted",
    truthBoundary: "sandbox-unconfirmed",
    providerHttpStatus: 200,
    providerCorrelationRef: maskedCardReference,
    responseShape: issueResponseShape,
    authoritativeReadback: {
      state: "not-started",
      providerState: "not-observed",
      matchCodes: [],
    },
    evidenceCodes: ["CARD_RESPONSE_VALIDATED", "DIRECT_READBACK_REQUIRED"],
  });
  entries = append(entries, {
    occurredAt: "2026-08-08T23:37:57.472Z",
    state: "readback-pending",
    truthBoundary: "sandbox-unconfirmed",
    authoritativeReadback: {
      state: "pending",
      observedAt: "2026-08-08T23:37:57.472Z",
      providerState: "pending",
      matchCodes: ["DIRECT_CARD_READBACK_STARTED"],
    },
    evidenceCodes: ["DIRECT_CARD_READBACK_STARTED"],
  });
  entries = append(entries, {
    occurredAt: "2026-08-08T23:37:57.592Z",
    state: "provider-confirmed",
    truthBoundary: "sandbox-authoritative",
    providerHttpStatus: 200,
    providerCorrelationRef: maskedCardReference,
    responseShape: cardReadbackShape,
    authoritativeReadback: {
      state: "matched-terminal",
      observedAt: "2026-08-08T23:37:57.592Z",
      providerState: "completed",
      matchCodes: [
        "CARD_ID_MATCH",
        "USER_ID_MATCH",
        "CARD_STATUS_ACTIVE",
        "CARD_TYPE_VIRTUAL",
        "CAP_REQUEST_ONLY",
      ],
    },
    evidenceCodes: [
      "CARD_ID_MATCH",
      "USER_ID_MATCH",
      "CARD_STATUS_ACTIVE",
      "CARD_TYPE_VIRTUAL",
      "CAP_REQUEST_ONLY",
      "CARD_ISSUANCE_CONFIRMED",
      "VERIFIED_REDACTED_CAPTURE",
    ],
  });

  return buildAuditReceipt(
    {
      receiptId: RAIN_CARD_AUDIT_RECEIPT_ID,
      generatedAt: "2026-08-08T23:37:58.000Z",
    },
    entries,
  );
}
