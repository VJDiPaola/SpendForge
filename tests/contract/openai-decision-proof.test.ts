import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  executeOpenAIDecisionProof,
  OPENAI_DECISION_PROOF_SCOPE,
} from "@/lib/decision/proof";
import {
  OperationJournalPersistenceError,
  type DurableOperationJournalStore,
  type OperationJournalEntry,
} from "@/lib/operations";

const attemptId = "openai-proof-20260809-atlas-v1";
const source = {
  VERCEL_ENV: "preview",
  OPENAI_API_KEY: "fixture-key-never-serialized",
  OPENAI_DECISION_MODEL: "gpt-5.6-terra",
  OPENAI_DECISION_ENABLED: "true",
  OPENAI_DECISION_PROOF_WINDOW_OPEN: "true",
  OPENAI_DECISION_AUTHORIZED_ATTEMPT_ID: attemptId,
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

function successfulEnvelope() {
  return {
    id: "resp_raw_openai_reference_must_not_escape",
    model: "gpt-5.6-terra",
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              action: "APPROVE",
              selectedResourceId: "offer_northstar_background_v1",
              maximumAuthorizedCents: 12,
              rationale:
                "The fixed-catalog resource fits the objective and bounded mandate.",
              evidenceIds: [
                "mandate:atlas:v1",
                "catalog:atlas:v1",
                "catalog:offer_northstar_background_v1",
                "quote:offer_northstar_background_v1",
              ],
              policyRisks: ["NONE"],
              confidenceBps: 9400,
            }),
          },
        ],
      },
    ],
    usage: {
      input_tokens: 320,
      output_tokens: 90,
      total_tokens: 410,
    },
  };
}

describe("bounded live OpenAI decision proof", () => {
  it("fails closed before fetch when Preview gates are not exact", async () => {
    const fetchImpl = vi.fn() as unknown as typeof globalThis.fetch;
    const store = new DurableFakeStore();

    await expect(
      executeOpenAIDecisionProof({
        attemptId,
        source: { ...source, VERCEL_ENV: "production" },
        store,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "OPENAI_PROOF_UNAVAILABLE" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await store.read(OPENAI_DECISION_PROOF_SCOPE)).toHaveLength(0);
  });

  it("durably claims before one Responses call and stores only redacted proof", async () => {
    const store = new DurableFakeStore();
    const fetchImpl = vi.fn(async () => Response.json(successfulEnvelope())) as unknown as typeof globalThis.fetch;

    const result = await executeOpenAIDecisionProof({
      attemptId,
      source,
      store,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      providerCalls: 1,
      paymentCalls: 0,
      truthBoundary: "model-structured-output",
      decision: {
        executionMode: "openai-live",
        truthState: "OPENAI_PROPOSAL_VERIFIED",
        policyVerification: {
          finalAction: "APPROVE",
          eligibleForExecution: true,
          verifiedMaximumAuthorizedCents: 12,
        },
      },
      receipt: {
        providers: ["openai"],
        modes: ["live-model"],
        truthBoundary: "model-structured-output",
      },
    });
    const journal = await store.read(OPENAI_DECISION_PROOF_SCOPE);
    expect(journal.map((entry) => entry.state)).toEqual([
      "submitted",
      "provider-accepted",
    ]);
    expect(journal[0].evidenceCodes).toContain("DURABLE_MODEL_CALL_CLAIMED");
    expect(journal[1].decisionAudit?.usage?.totalTokens).toBe(410);
    expect(JSON.stringify(result)).not.toContain(
      "resp_raw_openai_reference_must_not_escape",
    );
    expect(JSON.stringify(result)).not.toContain(source.OPENAI_API_KEY);

    await expect(
      executeOpenAIDecisionProof({
        attemptId,
        source,
        store,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "OPENAI_PROOF_ALREADY_CLAIMED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("records transport ambiguity and never retries", async () => {
    const store = new DurableFakeStore();
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("network unavailable");
    }) as unknown as typeof globalThis.fetch;

    await expect(
      executeOpenAIDecisionProof({
        attemptId,
        source,
        store,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "OPENAI_PROOF_AMBIGUOUS" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(
      (await store.read(OPENAI_DECISION_PROOF_SCOPE)).map(
        (entry) => entry.state,
      ),
    ).toEqual(["submitted", "ambiguous"]);
  });
});
