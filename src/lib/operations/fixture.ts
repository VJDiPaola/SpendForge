import { deriveEvidenceFingerprint } from "./fingerprint";
import { appendOperationEntry } from "./journal";
import { buildAuditReceipt } from "./receipt";
import type { AuditReceipt, OperationJournalEntry } from "./schemas";

export const SYNTHETIC_AUDIT_RECEIPT_ID = "audit_atlas_fixture_v1";

export function buildSyntheticAuditReceipt(): AuditReceipt {
  let entries: OperationJournalEntry[] = [];
  entries = appendOperationEntry(entries, {
    operationRef: "op_fixture_rain_readback",
    occurredAt: "2026-08-08T18:00:00.000Z",
    provider: "rain",
    mode: "fixture",
    operation: "rain.read_transaction",
    endpoint: "/issuing/transactions/{transactionId}",
    mutation: false,
    state: "closed",
    truthBoundary: "fixture-only",
    idempotencyFingerprint: deriveEvidenceFingerprint(
      "synthetic-atlas-rain-readback-v1",
    ),
    authoritativeReadback: {
      state: "not-required",
      providerState: "not-observed",
      matchCodes: ["FIXTURE_NO_PROVIDER_CALL"],
    },
    evidenceCodes: ["FIXTURE_NO_PROVIDER_CALL", "SYNTHETIC_RECORD"],
  });
  entries = appendOperationEntry(entries, {
    operationRef: "op_fixture_monad_receipt",
    occurredAt: "2026-08-08T18:00:01.000Z",
    provider: "monad_x402",
    mode: "fixture",
    operation: "monad_x402.read_receipt",
    endpoint: "/x402/receipt/{transactionRef}",
    mutation: false,
    state: "closed",
    truthBoundary: "fixture-only",
    idempotencyFingerprint: deriveEvidenceFingerprint(
      "synthetic-atlas-monad-receipt-v1",
    ),
    authoritativeReadback: {
      state: "not-required",
      providerState: "not-observed",
      matchCodes: ["FIXTURE_NO_PROVIDER_CALL"],
    },
    evidenceCodes: ["FIXTURE_NO_PROVIDER_CALL", "SYNTHETIC_RECORD"],
  });

  return buildAuditReceipt(
    {
      receiptId: SYNTHETIC_AUDIT_RECEIPT_ID,
      generatedAt: "2026-08-08T18:00:02.000Z",
    },
    entries,
  );
}
