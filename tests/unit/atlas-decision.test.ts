import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildAtlasDecisionReceipt,
  buildAtlasFixtureDecisionAudit,
  buildAtlasPurchaseDecisionInput,
} from "@/lib/demo";

describe("Atlas bounded fixture decision", () => {
  it("selects Northstar from a fixed catalog and leaves execution to policy", async () => {
    const input = buildAtlasPurchaseDecisionInput();
    const decision = await buildAtlasFixtureDecisionAudit();

    expect(input.catalog[0].resourceId).toBe(
      "offer_northstar_background_v1",
    );
    expect(decision).toMatchObject({
      executionMode: "fixture",
      evidenceMode: "fixture",
      providerResponseReference: null,
      proposal: {
        action: "APPROVE",
        selectedResourceId: "offer_northstar_background_v1",
        maximumAuthorizedCents: 12,
      },
      policyVerification: {
        finalAction: "APPROVE",
        verifiedMaximumAuthorizedCents: 12,
        eligibleForExecution: true,
        ruleCodes: ["POLICY_OK"],
      },
      truthState: "FIXTURE_PROPOSAL_VERIFIED",
    });
  });

  it("produces a stable, secret-free receipt with no model call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const receipt = await buildAtlasDecisionReceipt();
    const serialized = JSON.stringify(receipt);

    expect(receipt.chainOfThoughtStored).toBe(false);
    expect(receipt.disclosureCode).toBe(
      "FIXTURE_DECISION_NO_OPENAI_API_CALL",
    );
    expect(receipt.decision.inputDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(serialized).not.toMatch(/authorization|api.?key|private.?key/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
