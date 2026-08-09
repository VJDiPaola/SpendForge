import { describe, expect, it } from "vitest";

import {
  appendOperationEntry,
  assertCanonicalOperationJournal,
  buildAuditReceipt,
  captureResponseShape,
  deriveIdempotencyFingerprint,
  maskProviderReference,
  type OperationEntryDraft,
  type OperationJournalEntry,
} from "@/lib/operations";

const fingerprint = deriveIdempotencyFingerprint({
  missionRef: "mission_atlas",
  runRef: "run_sandbox_02",
  offerRef: "northstar_background",
  provider: "rain",
  operation: "rain.issue_scoped_card",
  generation: 1,
});

const base: OperationEntryDraft = {
  operationRef: "op_rain_card_0001",
  occurredAt: "2026-08-08T20:00:00.000Z",
  provider: "rain",
  mode: "live-sandbox",
  operation: "rain.issue_scoped_card",
  endpoint: "/issuing/users/{userId}/cards/scoped",
  mutation: true,
  state: "planned",
  truthBoundary: "sandbox-unconfirmed",
  idempotencyFingerprint: fingerprint,
  amount: {
    amount: "12",
    decimals: 2,
    asset: "USDC",
    network: "rain-sandbox",
  },
  authoritativeReadback: {
    state: "not-started",
    providerState: "not-observed",
    matchCodes: [],
  },
  evidenceCodes: ["OPERATION_PLANNED"],
};

function appendState(
  entries: readonly OperationJournalEntry[],
  state: OperationEntryDraft["state"],
  second: number,
  overrides: Partial<OperationEntryDraft> = {},
) {
  return appendOperationEntry(entries, {
    ...base,
    state,
    occurredAt: `2026-08-08T20:00:${String(second).padStart(2, "0")}.000Z`,
    evidenceCodes: [`STATE_${state.replaceAll("-", "_").toUpperCase()}`],
    ...overrides,
  });
}

describe("append-only operation journal", () => {
  it("appends immutable state transitions and derives tamper-evident refs", () => {
    const planned = appendState([], "planned", 0);
    const passed = appendState(planned, "gate-passed", 1);
    const submitted = appendState(passed, "submitted", 2);

    expect(planned).toHaveLength(1);
    expect(submitted.map((entry) => entry.sequence)).toEqual([1, 2, 3]);
    expect(submitted.every((entry) => /^entry_[a-f0-9]{24}$/.test(entry.entryRef))).toBe(
      true,
    );
    expect(() => assertCanonicalOperationJournal(submitted)).not.toThrow();
  });

  it("keeps async acceptance non-terminal until authoritative readback", () => {
    let journal = appendState([], "planned", 0);
    journal = appendState(journal, "gate-passed", 1);
    journal = appendState(journal, "submitted", 2);
    journal = appendState(journal, "provider-accepted", 3, {
      providerHttpStatus: 202,
      responseShape: captureResponseShape({ success: true }),
      providerRequestRef: maskProviderReference(
        "request",
        "rain-request-identifier-0001",
      ),
      evidenceCodes: ["HTTP_202_ACCEPTED", "READBACK_REQUIRED"],
    });
    journal = appendState(journal, "readback-pending", 4, {
      authoritativeReadback: {
        state: "pending",
        observedAt: "2026-08-08T20:00:04.000Z",
        providerState: "pending",
        matchCodes: ["DIRECT_READBACK_STARTED"],
      },
    });

    expect(journal.at(-1)?.state).toBe("readback-pending");
    expect(journal.at(-1)?.truthBoundary).toBe("sandbox-unconfirmed");
    expect(journal.at(-1)?.responseShape).toBeUndefined();
  });

  it("permits a success claim only with matched terminal readback", () => {
    let journal = appendState([], "submitted", 0);
    expect(() =>
      appendState(journal, "provider-confirmed", 1, {
        truthBoundary: "sandbox-authoritative",
      }),
    ).toThrow(/terminal authoritative readback/);

    journal = appendState(journal, "readback-pending", 1, {
      authoritativeReadback: {
        state: "pending",
        observedAt: "2026-08-08T20:00:01.000Z",
        providerState: "pending",
        matchCodes: ["DIRECT_READBACK_STARTED"],
      },
    });
    journal = appendState(journal, "provider-confirmed", 2, {
      truthBoundary: "sandbox-authoritative",
      authoritativeReadback: {
        state: "matched-terminal",
        observedAt: "2026-08-08T20:00:02.000Z",
        providerState: "completed",
        matchCodes: ["AMOUNT_MATCH", "PROVIDER_STATUS_COMPLETED"],
      },
    });

    expect(journal.at(-1)?.truthBoundary).toBe("sandbox-authoritative");
  });

  it("rejects raw provider IDs, chronology rewrites, and duplicate executed keys", () => {
    expect(() =>
      appendOperationEntry([], {
        ...base,
        providerRequestRef: "rain-request-id-unmasked",
      }),
    ).toThrow(/masked/);

    const first = appendState([], "submitted", 5);
    expect(() => appendState(first, "provider-pending", 4)).toThrow(
      /chronology/,
    );

    expect(() =>
      appendOperationEntry(first, {
        ...base,
        operationRef: "op_rain_card_0002",
        state: "submitted",
        occurredAt: "2026-08-08T20:00:06.000Z",
      }),
    ).toThrow(/Duplicate operation fingerprint/);
  });

  it("builds a redacted receipt with a deterministic journal hash", () => {
    const journal = appendState([], "planned", 0);
    const first = buildAuditReceipt(
      {
        receiptId: "audit_sandbox_card_0001",
        generatedAt: "2026-08-08T20:01:00.000Z",
      },
      journal,
    );
    const second = buildAuditReceipt(
      {
        receiptId: "audit_sandbox_card_0001",
        generatedAt: "2026-08-08T20:01:00.000Z",
      },
      journal,
    );

    expect(first.journalHash).toBe(second.journalHash);
    expect(first.redacted).toBe(true);
    expect(first.synthetic).toBe(false);
    expect(first.truthBoundary).toBe("sandbox-unconfirmed");
    expect(first.summary).toMatchObject({
      operationCount: 1,
      mutationCount: 1,
      authoritativeTerminalCount: 0,
    });
  });
});
