import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decryptRecoveryReference,
  encryptRecoveryReference,
} from "@/lib/operations/recovery";
import {
  appendOperationEntry,
  buildAuditReceipt,
  deriveEvidenceFingerprint,
} from "@/lib/operations";

const encodedKey = Buffer.alloc(32, 7).toString("base64");
const contextFingerprint = deriveEvidenceFingerprint(
  "rain-card-recovery-context-v1",
);
const rawCardId = "9d4f7bd6-19e6-40e7-9303-57bb1b7c5bee";

describe("encrypted provider recovery references", () => {
  it("round-trips only with the exact key, kind, and context", () => {
    const envelope = encryptRecoveryReference({
      kind: "rain_card_id",
      rawReference: rawCardId,
      contextFingerprint,
      encodedKey,
    });

    expect(JSON.stringify(envelope)).not.toContain(rawCardId);
    expect(
      decryptRecoveryReference({
        envelope,
        expectedKind: "rain_card_id",
        expectedContextFingerprint: contextFingerprint,
        encodedKey,
      }),
    ).toBe(rawCardId);
    expect(() =>
      decryptRecoveryReference({
        envelope,
        expectedKind: "rain_transaction_id",
        expectedContextFingerprint: contextFingerprint,
        encodedKey,
      }),
    ).toThrow("RECOVERY_REFERENCE_UNAVAILABLE");
  });

  it("never serializes the encrypted recovery envelope into a public receipt", () => {
    const envelope = encryptRecoveryReference({
      kind: "rain_card_id",
      rawReference: rawCardId,
      contextFingerprint,
      encodedKey,
    });
    const journal = appendOperationEntry([], {
      operationRef: "op_rain_recovery_test_v1",
      occurredAt: "2026-08-09T04:30:00.000Z",
      provider: "rain",
      mode: "live-sandbox",
      operation: "rain.issue_scoped_card",
      endpoint: "/issuing/users/{userId}/cards/scoped",
      mutation: true,
      state: "provider-accepted",
      truthBoundary: "sandbox-unconfirmed",
      idempotencyFingerprint: contextFingerprint,
      amount: {
        amount: "12",
        decimals: 2,
        asset: "USDC",
        network: "rain-sandbox",
      },
      recoveryEnvelope: envelope,
      authoritativeReadback: {
        state: "not-started",
        providerState: "not-observed",
        matchCodes: [],
      },
      evidenceCodes: ["ENCRYPTED_RECOVERY_REFERENCE_STORED"],
    });

    const receipt = buildAuditReceipt(
      {
        receiptId: "audit_rain_recovery_test_v1",
        generatedAt: "2026-08-09T04:30:01.000Z",
      },
      journal,
    );
    expect(journal[0].recoveryEnvelope).toBeDefined();
    expect(JSON.stringify(receipt)).not.toContain("recoveryEnvelope");
    expect(JSON.stringify(receipt)).not.toContain(envelope.ciphertext);
  });
});
