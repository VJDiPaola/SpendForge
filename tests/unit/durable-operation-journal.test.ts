import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  appendDurableOperationState,
  claimDurableOperationAttempt,
  deriveEvidenceFingerprint,
  type OperationEntryDraft,
  type OperationGateRequest,
  type ProviderOperationGuard,
} from "@/lib/operations";
import { MemoryOperationJournalStore } from "../helpers/memory-operation-journal";

const fingerprint = deriveEvidenceFingerprint("durable-rain-attempt-v1");
const amount = {
  amount: "12",
  decimals: 2,
  asset: "USDC" as const,
  network: "rain-sandbox" as const,
};
const request: OperationGateRequest = {
  operationRef: "op_rain_durable_claim_v1",
  provider: "rain",
  mode: "live-sandbox",
  operation: "rain.issue_scoped_card",
  attempt: 1,
  idempotencyFingerprint: fingerprint,
  amount,
};
const guard: ProviderOperationGuard = {
  provider: "rain",
  mode: "live-sandbox",
  mutationEnabled: true,
  allowedOperation: "rain.issue_scoped_card",
  maxMutations: 1,
  oneAttemptOnly: true,
  spendCap: amount,
};

function draft(
  state: OperationEntryDraft["state"],
  occurredAt: string,
): OperationEntryDraft {
  return {
    operationRef: request.operationRef,
    occurredAt,
    provider: request.provider,
    mode: request.mode,
    operation: request.operation,
    endpoint: "/issuing/users/{userId}/cards/scoped",
    mutation: true,
    state,
    truthBoundary:
      state === "provider-confirmed"
        ? "sandbox-authoritative"
        : "sandbox-unconfirmed",
    idempotencyFingerprint: fingerprint,
    amount,
    authoritativeReadback:
      state === "provider-confirmed"
        ? {
            state: "matched-terminal",
            observedAt: occurredAt,
            providerState: "completed",
            matchCodes: ["CARD_ID_MATCH"],
          }
        : {
            state: "not-started",
            providerState: "not-observed",
            matchCodes: [],
          },
    evidenceCodes:
      state === "submitted"
        ? ["DURABLE_MUTATION_CLAIM"]
        : ["CARD_ISSUANCE_CONFIRMED"],
  };
}

describe("durable operation claim", () => {
  it("allows one concurrent claimant and duplicate-blocks the other", async () => {
    const store = new MemoryOperationJournalStore();
    const input = {
      store,
      scopeFingerprint: fingerprint,
      guard,
      request,
      submitted: draft("submitted", "2026-08-08T20:00:00.000Z"),
    };

    const results = await Promise.all([
      claimDurableOperationAttempt(input),
      claimDurableOperationAttempt(input),
    ]);

    expect(results.filter((result) => result.decision.allowed)).toHaveLength(1);
    expect(
      results.find((result) => !result.decision.allowed)?.decision.codes,
    ).toContain("DUPLICATE_OPERATION");
    expect(await store.read(fingerprint)).toHaveLength(1);
  });

  it("appends terminal authoritative state without rewriting the claim", async () => {
    const store = new MemoryOperationJournalStore();
    await claimDurableOperationAttempt({
      store,
      scopeFingerprint: fingerprint,
      guard,
      request,
      submitted: draft("submitted", "2026-08-08T20:00:00.000Z"),
    });

    const result = await appendDurableOperationState({
      store,
      scopeFingerprint: fingerprint,
      draft: draft("provider-confirmed", "2026-08-08T20:00:01.000Z"),
    });

    expect(result.journal.map((entry) => entry.state)).toEqual([
      "submitted",
      "provider-confirmed",
    ]);
    expect(result.entry.authoritativeReadback).toMatchObject({
      state: "matched-terminal",
      providerState: "completed",
    });
  });
});
