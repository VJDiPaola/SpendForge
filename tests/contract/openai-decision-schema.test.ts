import { describe, expect, it } from "vitest";

import {
  OPENAI_PURCHASE_PROPOSAL_JSON_SCHEMA,
  auditedPurchaseDecisionSchema,
  modelPurchaseProposalSchema,
} from "@/lib/decision";

describe("OpenAI purchase proposal structured-output schema", () => {
  it("requires every bounded output field and rejects additional properties", () => {
    expect(OPENAI_PURCHASE_PROPOSAL_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(new Set(OPENAI_PURCHASE_PROPOSAL_JSON_SCHEMA.required)).toEqual(
      new Set(Object.keys(OPENAI_PURCHASE_PROPOSAL_JSON_SCHEMA.properties)),
    );
    expect(
      OPENAI_PURCHASE_PROPOSAL_JSON_SCHEMA.properties.action.enum,
    ).toEqual(["APPROVE", "REJECT", "NEEDS_REVIEW"]);
  });

  it("keeps model output and audit records strict at runtime", () => {
    const proposal = {
      action: "REJECT",
      selectedResourceId: null,
      maximumAuthorizedCents: 0,
      rationale: "The resource is outside the mandate.",
      evidenceIds: [],
      policyRisks: ["OVER_BUDGET"],
      confidenceBps: 9_500,
    };
    expect(modelPurchaseProposalSchema.safeParse(proposal).success).toBe(true);
    expect(
      modelPurchaseProposalSchema.safeParse({
        ...proposal,
        settlementClaim: "settled",
      }).success,
    ).toBe(false);

    expect(
      auditedPurchaseDecisionSchema.safeParse({
        schemaVersion: 1,
        modelId: "gpt-5.6-terra",
        promptVersion: "spendforge-purchase-decision-v1",
        inputDigest: `sha256:${"a".repeat(64)}`,
        executionMode: "openai-live",
        evidenceMode: "openai-structured-output",
        providerResponseReference: `openai-response:sha256:${"b".repeat(16)}`,
        proposal,
        policyVerification: {
          finalAction: "REJECT",
          selectedResourceId: null,
          verifiedMaximumAuthorizedCents: 0,
          eligibleForExecution: false,
          ruleCodes: ["MODEL_REJECTED"],
          modelActionOverridden: false,
        },
        truthState: "OPENAI_PROPOSAL_REJECTED_BY_POLICY",
        chainOfThought: "forbidden",
      }).success,
    ).toBe(false);
  });
});
