import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  executeRainNorthstarProof,
  executeRainNorthstarResume,
  inspectRainNorthstarRecoveryContinuity,
  reconcileRainNorthstarAuthorization,
  RAIN_NORTHSTAR_RUN_SCOPE,
} from "@/lib/integrations/rain/northstar-proof";
import {
  OperationJournalPersistenceError,
  type DurableOperationJournalStore,
  type OperationJournalEntry,
} from "@/lib/operations";

const userId = "11111111-1111-4111-8111-111111111111";
const contractId = "22222222-2222-4222-8222-222222222222";
const cardId = "33333333-3333-4333-8333-333333333333";
const transactionId = "44444444-4444-4444-8444-444444444444";
const attemptId = "rain-proof-test-northstar-v1";
const source = {
  VERCEL_ENV: "preview",
  RAIN_BASE_URL: "https://api-dev.raincards.xyz/v1",
  RAIN_API_KEY: "fake-rain-key-never-serialized",
  RAIN_USER_ID: userId,
  RAIN_CONTRACT_ID: contractId,
  RECOVERY_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  RAIN_MUTATIONS_ENABLED: "true",
  RAIN_CARD_ISSUANCE_ENABLED: "true",
  RAIN_AUTHORIZATION_ENABLED: "true",
  RAIN_SETTLEMENT_ENABLED: "true",
  RAIN_NORTHSTAR_PROOF_WINDOW_OPEN: "true",
  RAIN_NORTHSTAR_AUTHORIZED_ATTEMPT_ID: attemptId,
};

class DurableFakeStore implements DurableOperationJournalStore {
  readonly durability = "durable" as const;
  private readonly entries = new Map<string, OperationJournalEntry[]>();

  async read(scope: string) {
    return [...(this.entries.get(scope) ?? [])];
  }

  async append(
    scope: string,
    expectedPreviousSequence: number,
    entry: OperationJournalEntry,
  ) {
    const entries = this.entries.get(scope) ?? [];
    if (
      entries.length !== expectedPreviousSequence ||
      entry.sequence !== expectedPreviousSequence + 1
    ) {
      throw new OperationJournalPersistenceError("JOURNAL_CAS_CONFLICT");
    }
    this.entries.set(scope, [...entries, entry]);
  }
}

function spend(status: "pending" | "completed", overrides = {}) {
  return {
    id: transactionId,
    type: "spend",
    spend: {
      amount: 12,
      currency: "USD",
      receipt: status === "completed",
      merchantName: "Northstar Synthetic",
      merchantCategory: "Computer Software Stores",
      merchantCategoryCode: "5734",
      cardId,
      cardType: "virtual",
      userId,
      userFirstName: "Synthetic",
      userEmail: "synthetic@example.test",
      status,
      authorizedAt: "2026-08-09T04:40:00.000Z",
      ...(status === "completed"
        ? { postedAt: "2026-08-09T04:40:01.000Z" }
        : {}),
      ...overrides,
    },
  };
}

function responseSequence(finalOverrides = {}) {
  return [
    {
      id: cardId,
      encryptedPan: { iv: "encrypted-iv", data: "encrypted-pan" },
      encryptedCvc: { iv: "encrypted-iv", data: "encrypted-cvc" },
      last4: "1234",
      expirationMonth: "12",
      expirationYear: "2030",
      status: "active",
    },
    {
      id: cardId,
      userId,
      type: "virtual",
      status: "active",
      limit: { amount: 14, frequency: "lifetime" },
      configuration: { currency: "USD" },
    },
    { transactionId, status: "authorized" },
    spend("pending"),
    {
      transactionId,
      status: "settled",
      completionReason: "SETTLEMENT",
    },
    spend("completed", finalOverrides),
  ];
}

function fakeFetch(payloads: unknown[], calls?: Array<{ request: RequestInfo | URL; init?: RequestInit }>) {
  let index = 0;
  return vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
    calls?.push({ request, init });
    const payload = payloads[index];
    index += 1;
    return Response.json(payload);
  }) as unknown as typeof globalThis.fetch;
}

describe("bounded Rain Northstar sandbox proof", () => {
  it("claims each mutation before the call and proves exact completed readback", async () => {
    const store = new DurableFakeStore();
    const calls: Array<{ request: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchImpl = fakeFetch(responseSequence(), calls);

    const result = await executeRainNorthstarProof({
      attemptId,
      source,
      store,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(JSON.parse(String(calls[4].init?.body))).toEqual({ amount: 12 });
    expect(result).toMatchObject({
      providerCalls: 6,
      mutationCalls: 3,
      readbackCalls: 3,
      paymentClaim: "rain-sandbox-simulated-spend-completed",
      fundingClaim: "prior-funding-remains-uncorrelated",
      cardLimitClaim: "direct-readback-different",
      truthBoundary: "sandbox-authoritative",
    });
    const journal = await store.read(RAIN_NORTHSTAR_RUN_SCOPE);
    expect(
      journal
        .filter((entry) => entry.state === "submitted")
        .map((entry) => entry.operation),
    ).toEqual([
      "rain.issue_scoped_card",
      "rain.authorize_transaction",
      "rain.settle_transaction",
    ]);
    expect(journal.at(-1)).toMatchObject({
      state: "provider-confirmed",
      truthBoundary: "sandbox-authoritative",
      authoritativeReadback: {
        state: "matched-terminal",
        providerState: "completed",
      },
    });
    expect(JSON.stringify(result)).not.toContain(cardId);
    expect(JSON.stringify(result)).not.toContain(transactionId);
    expect(JSON.stringify(result)).not.toContain(source.RAIN_API_KEY);
    expect(JSON.stringify(result)).not.toContain("recoveryEnvelope");

    await expect(
      executeRainNorthstarProof({
        attemptId,
        source,
        store,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "RAIN_PROOF_ALREADY_CLAIMED" });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("accepts sandbox lowercase settlement reason and padded merchant names", async () => {
    const store = new DurableFakeStore();
    const fetchImpl = fakeFetch(
      responseSequence({ merchantName: " Northstar Synthetic  " }).map((payload) =>
        payload && typeof payload === "object" && "completionReason" in payload
          ? { ...payload, completionReason: "settlement" }
          : payload,
      ),
    );
    const result = await executeRainNorthstarProof({ attemptId, source, store, fetchImpl });
    expect(result.paymentClaim).toBe("rain-sandbox-simulated-spend-completed");
  });

  it("stops before settlement when the authorization readback mismatches", async () => {
    const store = new DurableFakeStore();
    const payloads = responseSequence();
    payloads[3] = spend("pending", { merchantCategoryCode: "7999" });
    const fetchImpl = fakeFetch(payloads);

    await expect(
      executeRainNorthstarProof({
        attemptId,
        source,
        store,
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      code: "RAIN_AUTHORIZATION_READBACK_MISMATCH",
      providerCalls: 4,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const journal = await store.read(RAIN_NORTHSTAR_RUN_SCOPE);
    expect(journal.some((entry) => entry.operation === "rain.settle_transaction")).toBe(false);

    const reconciliationFetch = fakeFetch([spend("pending")]);
    const reconciliation = await reconcileRainNorthstarAuthorization({
      attemptId: "rain-reconcile-test-northstar-v1",
      source: {
        ...source,
        RAIN_NORTHSTAR_RECONCILIATION_WINDOW_OPEN: "true",
        RAIN_NORTHSTAR_RECONCILIATION_ATTEMPT_ID:
          "rain-reconcile-test-northstar-v1",
      },
      store,
      fetchImpl: reconciliationFetch,
    });
    expect(reconciliation).toMatchObject({
      providerCalls: 1,
      mutationCalls: 0,
      status: "pending",
      matchesAllCausalFields: true,
      truthBoundary: "sandbox-unconfirmed",
    });
    expect(reconciliationFetch).toHaveBeenCalledTimes(1);

    const unavailableFetch = fakeFetch([spend("pending")]);
    await expect(
      reconcileRainNorthstarAuthorization({
        attemptId: "rain-reconcile-test-northstar-v1",
        source: {
          ...source,
          RECOVERY_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64"),
          RAIN_NORTHSTAR_RECONCILIATION_WINDOW_OPEN: "true",
          RAIN_NORTHSTAR_RECONCILIATION_ATTEMPT_ID:
            "rain-reconcile-test-northstar-v1",
        },
        store,
        fetchImpl: unavailableFetch,
      }),
    ).rejects.toMatchObject({
      code: "RAIN_RECOVERY_UNAVAILABLE",
      providerCalls: 0,
    });
    expect(unavailableFetch).not.toHaveBeenCalled();
  });

  it("fails closed before any call when a kill switch is closed", async () => {
    const store = new DurableFakeStore();
    const fetchImpl = fakeFetch(responseSequence());
    await expect(
      executeRainNorthstarProof({
        attemptId,
        source: { ...source, RAIN_SETTLEMENT_ENABLED: "false" },
        store,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "RAIN_PROOF_UNAVAILABLE" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resumes the recovered authorization and accepts only the observed exact 0.12 drift variant", async () => {
    const store = new DurableFakeStore();
    const seedPayloads = responseSequence();
    seedPayloads[3] = spend("pending", { merchantCategoryCode: "7999" });
    await expect(
      executeRainNorthstarProof({
        attemptId,
        source,
        store,
        fetchImpl: fakeFetch(seedPayloads),
      }),
    ).rejects.toMatchObject({ code: "RAIN_AUTHORIZATION_READBACK_MISMATCH" });

    const continuity = await inspectRainNorthstarRecoveryContinuity({
      source: { ...source, DATABASE_URL: "postgres://preview.invalid/test" },
      store,
    });
    expect(continuity).toEqual({
      journalReachable: true,
      cardEnvelopePresent: true,
      transactionEnvelopePresent: true,
      cardDecryptable: true,
      transactionDecryptable: true,
      keyFingerprintMatched: true,
      ready: true,
    });

    const resumeAttempt = "rain-reconcile-test-northstar-resume-v2";
    const resumeFetch = fakeFetch([
      spend("pending", {
        amount: 0.12,
        currency: "usd",
        merchantName: "northstar synthetic ",
      }),
      {
        transactionId,
        status: "settled",
        completionReason: "SETTLEMENT",
      },
      spend("completed", {
        amount: "0.12",
        currency: "usd",
        merchantName: "northstar synthetic ",
      }),
    ]);
    const result = await executeRainNorthstarResume({
      attemptId: resumeAttempt,
      source: {
        ...source,
        DATABASE_URL: "postgres://preview.invalid/test",
        RAIN_NORTHSTAR_RECONCILIATION_WINDOW_OPEN: "true",
        RAIN_NORTHSTAR_RECONCILIATION_ATTEMPT_ID: resumeAttempt,
      },
      store,
      fetchImpl: resumeFetch,
    });

    expect(resumeFetch).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      providerCalls: 3,
      mutationCalls: 1,
      readbackCalls: 2,
      amountEncoding: "observed-major-units",
      paymentClaim: "rain-sandbox-simulated-spend-completed",
      truthBoundary: "sandbox-authoritative",
    });
    expect(JSON.stringify(result)).not.toContain(cardId);
    expect(JSON.stringify(result)).not.toContain(transactionId);
    const journal = await store.read(RAIN_NORTHSTAR_RUN_SCOPE);
    expect(
      journal.filter((entry) => entry.operation === "rain.read_transaction"),
    ).toHaveLength(2);
    expect(journal.at(-1)).toMatchObject({
      operation: "rain.settle_transaction",
      state: "provider-confirmed",
      truthBoundary: "sandbox-authoritative",
      authoritativeReadback: {
        state: "matched-terminal",
        providerState: "completed",
      },
    });

    await expect(
      executeRainNorthstarResume({
        attemptId: resumeAttempt,
        source: {
          ...source,
          DATABASE_URL: "postgres://preview.invalid/test",
          RAIN_NORTHSTAR_RECONCILIATION_WINDOW_OPEN: "true",
          RAIN_NORTHSTAR_RECONCILIATION_ATTEMPT_ID: resumeAttempt,
        },
        store,
        fetchImpl: resumeFetch,
      }),
    ).rejects.toMatchObject({ code: "RAIN_RECONCILIATION_ALREADY_CLAIMED" });
    expect(resumeFetch).toHaveBeenCalledTimes(3);
  });

  it("fails the zero-call recovery probe when the Preview key cannot decrypt", async () => {
    const store = new DurableFakeStore();
    const payloads = responseSequence();
    payloads[3] = spend("pending", { merchantCategoryCode: "7999" });
    await expect(
      executeRainNorthstarProof({
        attemptId,
        source,
        store,
        fetchImpl: fakeFetch(payloads),
      }),
    ).rejects.toMatchObject({ code: "RAIN_AUTHORIZATION_READBACK_MISMATCH" });

    const result = await inspectRainNorthstarRecoveryContinuity({
      source: {
        ...source,
        DATABASE_URL: "postgres://preview.invalid/test",
        RECOVERY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      },
      store,
    });
    expect(result).toMatchObject({
      journalReachable: true,
      cardEnvelopePresent: true,
      transactionEnvelopePresent: true,
      cardDecryptable: false,
      transactionDecryptable: false,
      keyFingerprintMatched: false,
      ready: false,
    });
  });
});
