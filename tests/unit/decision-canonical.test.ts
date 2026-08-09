import { describe, expect, it } from "vitest";

import {
  canonicalDecisionInput,
  digestDecisionInput,
  maskOpenAIResponseId,
  type PurchaseDecisionInput,
} from "@/lib/decision";

const input: PurchaseDecisionInput = {
  mission: {
    id: "mission_digest",
    objective: "Select one fixed-catalog resource.",
    totalBudgetCents: 25,
    perPurchaseCapCents: 15,
    remainingBudgetCents: 25,
    allowedResourceTypes: ["component"],
    allowedVendorIds: ["vendor_pulse"],
    allowedMerchantCategoryCodes: [],
    requiredEvidenceIds: [],
    deadline: "2026-08-09T16:00:00.000Z",
  },
  catalog: [
    {
      resourceId: "resource_pulse",
      title: "Pulse component",
      description: "A vetted component manifest.",
      vendorId: "vendor_pulse",
      merchantCategoryCode: null,
      resourceType: "component",
      paymentRail: "MONAD_X402",
      quotedPriceCents: 1,
      active: true,
      provenance: "SIGNED",
      evidenceIds: [],
      securitySignals: [],
      providerState: "READY",
      attemptState: "NONE",
    },
  ],
  priorEvidence: [],
  now: "2026-08-08T18:00:00.000Z",
};

describe("decision evidence fingerprints", () => {
  it("produces canonical JSON and a full SHA-256 input digest", () => {
    expect(canonicalDecisionInput(input)).toBe(
      canonicalDecisionInput(JSON.parse(JSON.stringify(input))),
    );
    expect(digestDecisionInput(input)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("hashes rather than exposes a provider response ID", () => {
    const rawId = "resp_sensitive_reference_123456789";
    const masked = maskOpenAIResponseId(rawId);

    expect(masked).toMatch(/^openai-response:sha256:[0-9a-f]{16}$/);
    expect(masked).not.toContain(rawId);
  });
});
