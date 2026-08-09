import { describe, expect, it } from "vitest";

import {
  assertMissionRunInvariants,
  recordDeliveryEvidence,
} from "@/lib/domain";
import type { DeliveryEvidence, MissionRun } from "@/lib/domain";
import {
  ATLAS_FIXTURE_BUYER_ADDRESS,
  ATLAS_FIXTURE_SELLER_ADDRESS,
  ATLAS_MANDATE,
  buildAtlasFixtureRun,
  getAtlasFixtureCommittedSpend,
} from "@/lib/demo";

describe("Atlas fixture run", () => {
  it("is deterministic, JSON-safe, and returned as a fresh snapshot", () => {
    const first = buildAtlasFixtureRun();
    const second = buildAtlasFixtureRun();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(() => JSON.stringify(first)).not.toThrow();
    expect(JSON.stringify(first)).not.toContain("[object BigInt]");
    expect(() => assertMissionRunInvariants(first)).not.toThrow();
  });

  it("keeps declined and blocked offers separate from the completed run state", () => {
    const run = buildAtlasFixtureRun();
    const actions = Object.fromEntries(
      run.offerResults.map((result) => [
        result.offerId,
        { action: result.finalAction, state: result.state },
      ]),
    );

    expect(run.status).toBe("completed");
    expect(actions).toMatchObject({
      offer_grid_free_v1: { action: "decline", state: "declined" },
      offer_pulse_components_v1: { action: "buy", state: "outcome_passed" },
      offer_northstar_background_v1: { action: "buy", state: "outcome_passed" },
      offer_cinematic_gpu_v1: { action: "block", state: "blocked" },
      offer_unknown_injected_template_v1: { action: "block", state: "blocked" },
    });
  });

  it("never presents fixture receipts as authoritative provider truth", () => {
    const run = buildAtlasFixtureRun();

    expect(run.executionMode).toBe("fixture");
    expect(run.truthLabel.toLowerCase()).toContain("fixture");
    for (const payment of run.payments) {
      expect(payment.evidenceMode).toBe("fixture");
      expect(payment.authoritative).toBe(false);
      expect(payment.truthLabel.toLowerCase()).toContain("fixture");
      expect(payment.providerReference).toMatch(/^fixture:/);
      expect(payment.receipt?.kind).toBe("fixture-receipt");
      expect(payment.receipt?.transactionUrl).toBeUndefined();
    }
  });

  it("uses explicit parity accounting and distinct fixture buyer and seller wallets", () => {
    expect(getAtlasFixtureCommittedSpend()).toEqual({
      amount: "123000",
      decimals: 6,
      unit: "DEMO_USD",
      quoteId: "quote_atlas_fixture_usdc_usd_parity_v1",
    });
    expect(ATLAS_FIXTURE_BUYER_ADDRESS).not.toBe(ATLAS_FIXTURE_SELLER_ADDRESS);
    expect(ATLAS_MANDATE.demoSupplierMode.enabled).toBe(true);
    expect(ATLAS_MANDATE.demoSupplierMode.selfDealingExceptionOfferIds).toEqual([]);
  });

  it("preserves an x402 payment receipt when resource delivery validation fails", () => {
    const fixture = buildAtlasFixtureRun();
    const pulsePayment = fixture.payments.find(
      (payment) => payment.offerId === "offer_pulse_components_v1",
    );
    if (!pulsePayment) throw new Error("Missing Pulse fixture payment");

    const beforeFailure: MissionRun = {
      ...fixture,
      status: "delivering",
      deliveries: fixture.deliveries.filter(
        (delivery) => delivery.offerId !== "offer_pulse_components_v1",
      ),
      outcomes: fixture.outcomes.filter(
        (outcome) => outcome.offerId !== "offer_pulse_components_v1",
      ),
      offerResults: fixture.offerResults.map((result) =>
        result.offerId === "offer_pulse_components_v1"
          ? {
              offerId: result.offerId,
              offerVersion: result.offerVersion,
              finalAction: result.finalAction,
              state: "paid",
              decision: result.decision,
              policy: result.policy,
              paymentAttemptId: result.paymentAttemptId,
            }
          : result,
      ) as MissionRun["offerResults"],
    };
    const failure: DeliveryEvidence = {
      id: "delivery_pulse_invalid_test",
      paymentAttemptId: pulsePayment.id,
      offerId: pulsePayment.offerId,
      state: "failed",
      evidenceMode: "fixture",
      truthLabel: "Fixture invalid-manifest failure.",
      errorCode: "RESOURCE_SCHEMA_INVALID",
    };
    const next = recordDeliveryEvidence(
      beforeFailure,
      failure,
      "2026-08-08T18:00:30.000Z",
    );

    expect(next.status).toBe("failed");
    expect(next.payments.find((payment) => payment.id === pulsePayment.id)).toEqual(
      pulsePayment,
    );
    expect(pulsePayment.providerState).toBe("settled");
    expect(next.deliveries.at(-1)).toMatchObject({
      state: "failed",
      paymentAttemptId: pulsePayment.id,
    });
  });
});
