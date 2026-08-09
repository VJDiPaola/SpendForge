import { describe, expect, it } from "vitest";

import {
  createLogicalIdempotencyKey,
  evaluatePurchasePolicy,
  resolveFinalAction,
  zeroBudgetAmount,
} from "@/lib/domain";
import type {
  Mandate,
  PolicyContext,
  PurchaseDecision,
  ResourceOffer,
} from "@/lib/domain";
import {
  ATLAS_DECISIONS,
  ATLAS_DEMO_PARITY_QUOTE,
  ATLAS_FIXTURE_BUYER_ADDRESS,
  ATLAS_MANDATE,
  ATLAS_MISSION,
  ATLAS_OFFERS,
} from "@/lib/demo";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function offer(id: string): ResourceOffer {
  const match = ATLAS_OFFERS.find((candidate) => candidate.id === id);
  if (!match) throw new Error(`Unknown test offer ${id}`);
  return clone(match);
}

function decision(id: string): PurchaseDecision {
  const match = ATLAS_DECISIONS.find((candidate) => candidate.offerId === id);
  if (!match) throw new Error(`Unknown test decision ${id}`);
  return clone(match);
}

function policyContext(
  resource: ResourceOffer,
  overrides: Partial<PolicyContext> = {},
): PolicyContext {
  const idempotencyKey = createLogicalIdempotencyKey({
    missionId: ATLAS_MISSION.id,
    runId: "run_policy_test",
    offerId: resource.id,
    rail: resource.rail,
    mandateVersion: ATLAS_MANDATE.version,
    attemptGeneration: 0,
  });

  return {
    now: "2026-08-08T18:00:00.000Z",
    committedSpend: zeroBudgetAmount(ATLAS_DEMO_PARITY_QUOTE),
    parityQuote: clone(ATLAS_DEMO_PARITY_QUOTE),
    buyerWalletAddress: ATLAS_FIXTURE_BUYER_ADDRESS,
    providerHealth: { free: true, rain_card: true, monad_x402: true },
    terminalIdempotencyKeys: new Set<string>(),
    idempotencyKey,
    ...overrides,
  };
}

describe("deterministic mandate policy", () => {
  it("allows Pulse with an explicit quote and distinct fixture wallets", () => {
    const resource = offer("offer_pulse_components_v1");
    const proposal = decision(resource.id);
    const result = evaluatePurchasePolicy({
      offer: resource,
      mandate: clone(ATLAS_MANDATE),
      decision: proposal,
      context: policyContext(resource),
    });

    expect(result.disposition).toBe("allowed");
    expect(result.ruleCodes).toEqual(["POLICY_OK"]);
    expect(resolveFinalAction(proposal, result)).toBe("buy");
  });

  it("blocks the GPU offer with named, independent hard rules", () => {
    const resource = offer("offer_cinematic_gpu_v1");
    const result = evaluatePurchasePolicy({
      offer: resource,
      mandate: clone(ATLAS_MANDATE),
      decision: decision(resource.id),
      context: policyContext(resource),
    });

    expect(result.disposition).toBe("blocked");
    expect(result.ruleCodes).toEqual(
      expect.arrayContaining([
        "RESOURCE_TYPE_NOT_ALLOWED",
        "PER_PURCHASE_CAP_EXCEEDED",
        "TOTAL_BUDGET_EXCEEDED",
        "DELIVERY_TYPE_UNSUPPORTED",
      ]),
    );
  });

  it("blocks prompt injection even when the resource is cheap", () => {
    const resource = offer("offer_unknown_injected_template_v1");
    const result = evaluatePurchasePolicy({
      offer: resource,
      mandate: clone(ATLAS_MANDATE),
      decision: decision(resource.id),
      context: policyContext(resource),
    });

    expect(result.disposition).toBe("blocked");
    expect(result.ruleCodes).toContain("PROMPT_INJECTION_DETECTED");
    expect(resolveFinalAction(decision(resource.id), result)).toBe("block");
  });

  it("escalates same-wallet self-dealing unless the exact demo exception is named", () => {
    const resource = offer("offer_pulse_components_v1");
    resource.seller.walletAddress = ATLAS_FIXTURE_BUYER_ADDRESS;
    const proposal = decision(resource.id);
    const mandate = clone(ATLAS_MANDATE);

    const denied = evaluatePurchasePolicy({
      offer: resource,
      mandate,
      decision: proposal,
      context: policyContext(resource),
    });
    expect(denied.disposition).toBe("escalate");
    expect(denied.ruleCodes).toContain("SELF_DEALING_RISK");

    const disclosedMandate: Mandate = {
      ...mandate,
      demoSupplierMode: {
        ...mandate.demoSupplierMode,
        enabled: true,
        selfDealingExceptionOfferIds: [resource.id],
      },
    };
    const allowed = evaluatePurchasePolicy({
      offer: resource,
      mandate: disclosedMandate,
      decision: proposal,
      context: policyContext(resource),
    });
    expect(allowed.disposition).toBe("allowed");
    expect(allowed.ruleCodes).toEqual(["POLICY_OK"]);
  });

  it("turns low confidence and missing provider configuration into escalation", () => {
    const resource = offer("offer_pulse_components_v1");
    const proposal = { ...decision(resource.id), confidenceBps: 8400 };
    const result = evaluatePurchasePolicy({
      offer: resource,
      mandate: clone(ATLAS_MANDATE),
      decision: proposal,
      context: policyContext(resource, {
        providerHealth: { free: true, rain_card: true, monad_x402: false },
      }),
    });

    expect(result.disposition).toBe("escalate");
    expect(result.ruleCodes).toEqual(
      expect.arrayContaining(["LOW_CONFIDENCE", "PROVIDER_CONFIGURATION_UNHEALTHY"]),
    );
  });

  it("blocks a terminal duplicate attempt without changing its key", () => {
    const resource = offer("offer_northstar_background_v1");
    const context = policyContext(resource);
    const result = evaluatePurchasePolicy({
      offer: resource,
      mandate: clone(ATLAS_MANDATE),
      decision: decision(resource.id),
      context: {
        ...context,
        terminalIdempotencyKeys: new Set([context.idempotencyKey]),
      },
    });

    expect(result.disposition).toBe("blocked");
    expect(result.ruleCodes).toContain("DUPLICATE_TERMINAL_ATTEMPT");
    expect(
      createLogicalIdempotencyKey({
        missionId: ATLAS_MISSION.id,
        runId: "run_policy_test",
        offerId: resource.id,
        rail: resource.rail,
        mandateVersion: ATLAS_MANDATE.version,
        attemptGeneration: 0,
      }),
    ).toBe(context.idempotencyKey);
  });
});
