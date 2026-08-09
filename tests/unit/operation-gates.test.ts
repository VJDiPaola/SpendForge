import { describe, expect, it } from "vitest";

import {
  appendOperationEntry,
  deriveIdempotencyFingerprint,
  evaluateOperationGate,
  type OperationJournalEntry,
  type ProviderOperationGuard,
} from "@/lib/operations";

const amount = {
  amount: "100000",
  decimals: 2,
  asset: "rUSD" as const,
  network: "rain-sandbox" as const,
};

const guard: ProviderOperationGuard = {
  provider: "rain",
  mode: "live-sandbox",
  mutationEnabled: true,
  allowedOperation: "rain.fund_collateral",
  maxMutations: 1,
  oneAttemptOnly: true,
  spendCap: amount,
};

const fingerprint = deriveIdempotencyFingerprint({
  missionRef: "mission_atlas",
  runRef: "run_sandbox_01",
  offerRef: "collateral_setup",
  provider: "rain",
  operation: "rain.fund_collateral",
  generation: 2,
});

function request(overrides: Record<string, unknown> = {}) {
  return {
    operationRef: "op_rain_fund_0001",
    provider: "rain" as const,
    mode: "live-sandbox" as const,
    operation: "rain.fund_collateral" as const,
    attempt: 1,
    idempotencyFingerprint: fingerprint,
    amount,
    ...overrides,
  };
}

function executedJournal(): OperationJournalEntry[] {
  return appendOperationEntry([], {
    operationRef: "op_prior_fund_0001",
    occurredAt: "2026-08-08T19:00:00.000Z",
    provider: "rain",
    mode: "live-sandbox",
    operation: "rain.fund_collateral",
    endpoint: "/simulate/collateral/fund",
    mutation: true,
    state: "submitted",
    truthBoundary: "sandbox-unconfirmed",
    idempotencyFingerprint: fingerprint,
    amount,
    authoritativeReadback: {
      state: "not-started",
      providerState: "not-observed",
      matchCodes: [],
    },
    evidenceCodes: ["MUTATION_SUBMITTED"],
  });
}

describe("provider operation guards", () => {
  it("derives a deterministic, non-reversible evidence fingerprint", () => {
    const again = deriveIdempotencyFingerprint({
      missionRef: "mission_atlas",
      runRef: "run_sandbox_01",
      offerRef: "collateral_setup",
      provider: "rain",
      operation: "rain.fund_collateral",
      generation: 2,
    });
    const nextGeneration = deriveIdempotencyFingerprint({
      missionRef: "mission_atlas",
      runRef: "run_sandbox_01",
      offerRef: "collateral_setup",
      provider: "rain",
      operation: "rain.fund_collateral",
      generation: 3,
    });

    expect(again).toBe(fingerprint);
    expect(nextGeneration).not.toBe(fingerprint);
    expect(fingerprint).not.toContain("mission_atlas");
  });

  it("allows one bounded sandbox mutation when every gate passes", () => {
    expect(
      evaluateOperationGate({ config: guard, request: request(), journal: [] }),
    ).toEqual({ allowed: true, codes: ["GUARD_ALLOWED"] });
  });

  it("fails closed when the provider-specific kill switch is closed", () => {
    const result = evaluateOperationGate({
      config: { ...guard, mutationEnabled: false },
      request: request(),
      journal: [],
    });

    expect(result.allowed).toBe(false);
    expect(result.codes).toContain("KILL_SWITCH_CLOSED");
  });

  it("detects an executed fingerprint and reports only its public operation ref", () => {
    const result = evaluateOperationGate({
      config: guard,
      request: request(),
      journal: executedJournal(),
    });

    expect(result.allowed).toBe(false);
    expect(result.codes).toContain("DUPLICATE_OPERATION");
    expect(result.codes).toContain("MUTATION_CAP_REACHED");
    expect(result.duplicateOperationRef).toBe("op_prior_fund_0001");
  });

  it("blocks second attempts, fixture mutations, and over-cap amounts", () => {
    const result = evaluateOperationGate({
      config: guard,
      request: request({
        attempt: 2,
        mode: "fixture",
        amount: { ...amount, amount: "100001" },
      }),
      journal: [],
    });

    expect(result.allowed).toBe(false);
    expect(result.codes).toEqual(
      expect.arrayContaining([
        "ONE_ATTEMPT_REQUIRED",
        "FIXTURE_MUTATION_FORBIDDEN",
        "MODE_MISMATCH",
        "SPEND_CAP_EXCEEDED",
      ]),
    );
  });

  it("cannot use a Rain switch to authorize a Monad mutation", () => {
    const monadFingerprint = deriveIdempotencyFingerprint({
      missionRef: "mission_atlas",
      runRef: "run_testnet_01",
      offerRef: "pulse_component",
      provider: "monad_x402",
      operation: "monad_x402.pay_resource",
      generation: 1,
    });
    const result = evaluateOperationGate({
      config: guard,
      request: request({
        provider: "monad_x402",
        mode: "testnet",
        operation: "monad_x402.pay_resource",
        idempotencyFingerprint: monadFingerprint,
        amount: {
          amount: "3000",
          decimals: 6,
          asset: "USDC",
          network: "eip155:10143",
        },
      }),
      journal: [],
    });

    expect(result.allowed).toBe(false);
    expect(result.codes).toEqual(
      expect.arrayContaining([
        "PROVIDER_MISMATCH",
        "MODE_MISMATCH",
        "OPERATION_NOT_ALLOWED",
        "SPEND_CAP_MISMATCH",
      ]),
    );
  });

  it("blocks concurrent purchases that exceed the run-wide cumulative cap", () => {
    const priorFingerprint = deriveIdempotencyFingerprint({
      missionRef: "mission_atlas",
      runRef: "run_sandbox_budget",
      offerRef: "prior_purchase",
      provider: "rain",
      operation: "rain.authorize_transaction",
      generation: 1,
    });
    const currentFingerprint = deriveIdempotencyFingerprint({
      missionRef: "mission_atlas",
      runRef: "run_sandbox_budget",
      offerRef: "northstar_purchase",
      provider: "rain",
      operation: "rain.authorize_transaction",
      generation: 1,
    });
    const prior = appendOperationEntry([], {
      operationRef: "op_prior_authorize_v1",
      occurredAt: "2026-08-09T04:40:00.000Z",
      provider: "rain",
      mode: "live-sandbox",
      operation: "rain.authorize_transaction",
      endpoint: "/simulate/transactions/authorize",
      mutation: true,
      state: "submitted",
      truthBoundary: "sandbox-unconfirmed",
      idempotencyFingerprint: priorFingerprint,
      amount: {
        amount: "20",
        decimals: 2,
        asset: "USD",
        network: "rain-sandbox",
      },
      authoritativeReadback: {
        state: "not-started",
        providerState: "not-observed",
        matchCodes: [],
      },
      evidenceCodes: ["DURABLE_MUTATION_CLAIM"],
    });

    const result = evaluateOperationGate({
      config: {
        provider: "rain",
        mode: "live-sandbox",
        mutationEnabled: true,
        allowedOperation: "rain.authorize_transaction",
        maxMutations: 3,
        oneAttemptOnly: true,
        spendCap: {
          amount: "15",
          decimals: 2,
          asset: "USD",
          network: "rain-sandbox",
        },
        cumulativeSpendCap: {
          amount: "25",
          decimals: 2,
          asset: "USD",
          network: "rain-sandbox",
        },
      },
      request: {
        operationRef: "op_northstar_authorize_v1",
        provider: "rain",
        mode: "live-sandbox",
        operation: "rain.authorize_transaction",
        attempt: 1,
        idempotencyFingerprint: currentFingerprint,
        amount: {
          amount: "12",
          decimals: 2,
          asset: "USD",
          network: "rain-sandbox",
        },
      },
      journal: prior,
    });

    expect(result.allowed).toBe(false);
    expect(result.codes).toContain("CUMULATIVE_SPEND_CAP_EXCEEDED");
  });
});
