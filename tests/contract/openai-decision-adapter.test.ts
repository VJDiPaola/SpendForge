import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DEFAULT_OPENAI_DECISION_MODEL,
  OPENAI_RESPONSES_ENDPOINT,
  OpenAIDecisionModel,
} from "@/lib/decision/openai";
import type {
  ModelPurchaseProposal,
  PurchaseDecisionInput,
} from "@/lib/decision";

const fakeApiKey = "sk-test-fixture-not-a-real-key";
const rawResponseId = "resp_sensitive_provider_reference_123456";

function input(): PurchaseDecisionInput {
  return {
    mission: {
      id: "mission_openai_contract",
      objective: "Select a licensed media resource for the Atlas hero.",
      totalBudgetCents: 25,
      perPurchaseCapCents: 15,
      remainingBudgetCents: 25,
      allowedResourceTypes: ["media"],
      allowedVendorIds: ["vendor_northstar"],
      allowedMerchantCategoryCodes: ["5734"],
      requiredEvidenceIds: ["evidence_license"],
      deadline: "2026-08-09T16:00:00.000Z",
    },
    catalog: [
      {
        resourceId: "resource_northstar_v1",
        title: "Northstar background license",
        description: "A signed synthetic background asset.",
        vendorId: "vendor_northstar",
        merchantCategoryCode: "5734",
        resourceType: "media",
        paymentRail: "RAIN_CARD",
        quotedPriceCents: 12,
        active: true,
        provenance: "SIGNED",
        evidenceIds: ["evidence_license"],
        securitySignals: [],
        providerState: "READY",
        attemptState: "NONE",
      },
    ],
    priorEvidence: [
      {
        evidenceId: "evidence_license",
        state: "AVAILABLE",
        summary: "Synthetic license evidence is available.",
      },
    ],
    now: "2026-08-08T18:00:00.000Z",
  };
}

function proposal(): ModelPurchaseProposal {
  return {
    action: "APPROVE",
    selectedResourceId: "resource_northstar_v1",
    maximumAuthorizedCents: 12,
    rationale: "The resource is relevant and within the stated mission budget.",
    evidenceIds: ["evidence_license"],
    policyRisks: ["NONE"],
    confidenceBps: 9_400,
  };
}

function responseEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    id: rawResponseId,
    model: DEFAULT_OPENAI_DECISION_MODEL,
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(proposal()),
          },
        ],
      },
    ],
    usage: {
      input_tokens: 240,
      output_tokens: 80,
      total_tokens: 320,
    },
    ...overrides,
  };
}

describe("OpenAI Responses decision adapter contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails closed before fetch when OPENAI_API_KEY is absent", async () => {
    const fetchImpl = vi.fn() as unknown as typeof globalThis.fetch;
    const adapter = new OpenAIDecisionModel({ enabled: true, fetchImpl });

    expect(adapter.isConfigured()).toBe(false);
    await expect(adapter.decide(input())).rejects.toMatchObject({
      code: "OPENAI_CONFIGURATION_MISSING",
      retryable: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses one tool-free Responses request with strict structured output", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(responseEnvelope()),
    ) as unknown as typeof globalThis.fetch;
    const adapter = new OpenAIDecisionModel({
      apiKey: fakeApiKey,
      enabled: true,
      fetchImpl,
    });

    const decision = await adapter.decide(input());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe(OPENAI_RESPONSES_ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${fakeApiKey}`);

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: DEFAULT_OPENAI_DECISION_MODEL,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 600,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "spendforge_purchase_proposal",
          strict: true,
          schema: { additionalProperties: false },
        },
      },
    });
    expect(body).not.toHaveProperty("tools");
    expect(JSON.stringify(body)).not.toContain(fakeApiKey);

    expect(decision).toMatchObject({
      modelId: DEFAULT_OPENAI_DECISION_MODEL,
      executionMode: "openai-live",
      evidenceMode: "openai-structured-output",
      truthState: "OPENAI_PROPOSAL_VERIFIED",
      policyVerification: {
        finalAction: "APPROVE",
        verifiedMaximumAuthorizedCents: 12,
        eligibleForExecution: true,
      },
    });
    expect(decision.providerResponseReference).toMatch(
      /^openai-response:sha256:[0-9a-f]{16}$/,
    );
    expect(decision.usage).toEqual({
      inputTokens: 240,
      outputTokens: 80,
      totalTokens: 320,
    });
    expect(decision.outputDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(decision)).not.toContain(rawResponseId);
    expect(JSON.stringify(decision)).not.toContain(fakeApiKey);
  });

  it("does not trust a schema-valid proposal that deterministic policy blocks", async () => {
    const blockedProposal = {
      ...proposal(),
      maximumAuthorizedCents: 45,
    };
    const blockedInput = input();
    blockedInput.catalog[0].quotedPriceCents = 45;
    const fetchImpl = vi.fn(async () =>
      Response.json(
        responseEnvelope({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(blockedProposal),
                },
              ],
            },
          ],
        }),
      ),
    ) as unknown as typeof globalThis.fetch;
    const adapter = new OpenAIDecisionModel({
      apiKey: fakeApiKey,
      enabled: true,
      fetchImpl,
    });

    const decision = await adapter.decide(blockedInput);

    expect(decision.truthState).toBe("OPENAI_PROPOSAL_REJECTED_BY_POLICY");
    expect(decision.policyVerification).toMatchObject({
      finalAction: "REJECT",
      eligibleForExecution: false,
      verifiedMaximumAuthorizedCents: 0,
      modelActionOverridden: true,
    });
    expect(decision.policyVerification.ruleCodes).toContain(
      "PER_PURCHASE_CAP_EXCEEDED",
    );
  });

  it("rejects incomplete, refusal, and malformed provider output safely", async () => {
    const cases = [
      {
        envelope: responseEnvelope({ status: "incomplete" }),
        code: "OPENAI_RESPONSE_INCOMPLETE",
      },
      {
        envelope: responseEnvelope({
          output: [
            {
              type: "message",
              content: [{ type: "refusal", refusal: "not returned" }],
            },
          ],
        }),
        code: "OPENAI_RESPONSE_REFUSED",
      },
      {
        envelope: responseEnvelope({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "not-json" }],
            },
          ],
        }),
        code: "OPENAI_RESPONSE_INVALID",
      },
    ] as const;

    for (const testCase of cases) {
      const fetchImpl = vi.fn(async () => Response.json(testCase.envelope));
      const adapter = new OpenAIDecisionModel({
        apiKey: fakeApiKey,
        enabled: true,
        fetchImpl,
      });
      await expect(adapter.decide(input())).rejects.toMatchObject({
        code: testCase.code,
      });
    }
  });

  it("returns only status metadata for provider HTTP errors", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { error: { message: "sensitive provider detail must be discarded" } },
        { status: 429 },
      ),
    ) as unknown as typeof globalThis.fetch;
    const adapter = new OpenAIDecisionModel({
      apiKey: fakeApiKey,
      enabled: true,
      fetchImpl,
    });

    await expect(adapter.decide(input())).rejects.toMatchObject({
      message: "OPENAI_HTTP_ERROR",
      code: "OPENAI_HTTP_ERROR",
      retryable: true,
      status: 429,
    });
  });

  it("keeps a configured key behind the explicit execution gate", async () => {
    const fetchImpl = vi.fn() as unknown as typeof globalThis.fetch;
    const adapter = new OpenAIDecisionModel({
      apiKey: fakeApiKey,
      fetchImpl,
    });

    expect(adapter.isConfigured()).toBe(true);
    await expect(adapter.decide(input())).rejects.toMatchObject({
      code: "OPENAI_EXECUTION_DISABLED",
      retryable: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
