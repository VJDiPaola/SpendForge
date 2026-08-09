import {
  purchaseDecisionInputSchema,
  type AuditedPurchaseDecision,
  type DecisionModel,
  type ModelPurchaseProposal,
  type PurchaseDecisionInput,
} from "./contracts";
import { createAuditedDecision } from "./policy";

export const FIXTURE_DECISION_MODEL_ID =
  "spendforge-deterministic-fixture-v1";

/**
 * A deterministic replay/test adapter. It intentionally makes a simple first-
 * catalog proposal so evals exercise the code-owned policy override rather than
 * smuggling policy enforcement into a pretend model.
 */
export class DeterministicFixtureDecisionModel implements DecisionModel {
  async decide(
    inputValue: PurchaseDecisionInput,
  ): Promise<AuditedPurchaseDecision> {
    const input = purchaseDecisionInputSchema.parse(inputValue);
    const selected = input.catalog[0];
    const evidenceIds = Array.from(
      new Set([
        ...input.mission.requiredEvidenceIds,
        ...selected.evidenceIds,
      ]),
    ).slice(0, 32);
    const proposal: ModelPurchaseProposal = {
      action: "APPROVE",
      selectedResourceId: selected.resourceId,
      maximumAuthorizedCents: selected.quotedPriceCents,
      rationale:
        "Selected from the fixed catalog for mission fit; deterministic policy verification remains the execution authority.",
      evidenceIds,
      policyRisks: ["NONE"],
      confidenceBps: 9_300,
    };

    return createAuditedDecision(input, proposal, {
      modelId: FIXTURE_DECISION_MODEL_ID,
      executionMode: "fixture",
      evidenceMode: "fixture",
      providerResponseReference: null,
      startedAt: input.now,
      completedAt: input.now,
      usage: null,
    });
  }
}
