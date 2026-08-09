import "server-only";

import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import {
  appendDurableOperationState,
  buildAuditReceipt,
  captureResponseShape,
  claimDurableOperationAttempt,
  deriveEvidenceFingerprint,
  deriveIdempotencyFingerprint,
  maskProviderReference,
  type AuditReceipt,
  type DurableOperationJournalStore,
  type OperationEntryDraft,
} from "@/lib/operations";
import { createRuntimeOperationJournalStore } from "@/lib/operations/postgres-store";
import { buildAtlasPurchaseDecisionInput } from "@/lib/demo/atlas-decision";

import {
  OpenAIDecisionError,
  OpenAIDecisionModel,
  DEFAULT_OPENAI_DECISION_MODEL,
} from "./openai";
import type { AuditedPurchaseDecision } from "./contracts";

export const OPENAI_DECISION_PROOF_RECEIPT_ID =
  "audit_atlas_openai_decision_live_v1";
export const OPENAI_DECISION_PROOF_OPERATION_REF =
  "op_openai_decision_atlas_v1";
export const OPENAI_DECISION_PROOF_SCOPE = deriveEvidenceFingerprint(
  "spendforge:atlas:openai-decision-proof:v1",
);

const proofEnvironmentSchema = z
  .object({
    VERCEL_ENV: z.literal("preview"),
    OPENAI_API_KEY: z.string().trim().min(1),
    OPENAI_DECISION_MODEL: z
      .string()
      .trim()
      .min(1)
      .default(DEFAULT_OPENAI_DECISION_MODEL),
    OPENAI_DECISION_ENABLED: z.literal("true"),
    OPENAI_DECISION_PROOF_WINDOW_OPEN: z.literal("true"),
    OPENAI_DECISION_AUTHORIZED_ATTEMPT_ID: z
      .string()
      .regex(/^openai-proof-[a-z0-9-]{12,80}$/),
  })
  .passthrough();

export type OpenAIDecisionProofResult = {
  decision: AuditedPurchaseDecision;
  receipt: AuditReceipt;
  providerCalls: 1;
  paymentCalls: 0;
  truthBoundary: "model-structured-output";
};

export type OpenAIDecisionProofErrorCode =
  | "OPENAI_PROOF_UNAVAILABLE"
  | "OPENAI_PROOF_UNAUTHORIZED"
  | "OPENAI_PROOF_ALREADY_CLAIMED"
  | "OPENAI_PROOF_AMBIGUOUS"
  | "OPENAI_PROOF_FAILED";

export class OpenAIDecisionProofError extends Error {
  constructor(
    readonly code: OpenAIDecisionProofErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "OpenAIDecisionProofError";
  }
}

function sameExactValue(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function operationDraft(
  input: Omit<
    OperationEntryDraft,
    | "operationRef"
    | "provider"
    | "mode"
    | "operation"
    | "endpoint"
    | "mutation"
    | "idempotencyFingerprint"
  >,
): OperationEntryDraft {
  return {
    operationRef: OPENAI_DECISION_PROOF_OPERATION_REF,
    provider: "openai",
    mode: "live-model",
    operation: "openai.propose_purchase",
    endpoint: "/v1/responses",
    mutation: true,
    idempotencyFingerprint: deriveIdempotencyFingerprint({
      missionRef: "mission_atlas_launch_v1",
      runRef: "run_atlas_openai_proof_v1",
      offerRef: "offer_northstar_background_v1",
      provider: "openai",
      operation: "openai.propose_purchase",
      generation: 1,
    }),
    ...input,
  };
}

function classifyFailure(error: unknown): {
  state: "ambiguous" | "provider-failed";
  truthBoundary: "model-ambiguous" | "model-failed";
  evidenceCodes: string[];
  status: number;
} {
  if (
    error instanceof OpenAIDecisionError &&
    (error.code === "OPENAI_TRANSPORT_FAILED" || error.retryable)
  ) {
    return {
      state: "ambiguous",
      truthBoundary: "model-ambiguous",
      evidenceCodes: ["OPENAI_OUTCOME_AMBIGUOUS", "NO_AUTOMATIC_RETRY"],
      status: 502,
    };
  }
  return {
    state: "provider-failed",
    truthBoundary: "model-failed",
    evidenceCodes: ["OPENAI_PROPOSAL_NOT_ACCEPTED", "NO_AUTOMATIC_RETRY"],
    status: 502,
  };
}

export async function executeOpenAIDecisionProof(input: {
  attemptId: string | null;
  source?: Record<string, string | undefined>;
  store?: DurableOperationJournalStore;
  fetchImpl?: typeof globalThis.fetch;
}): Promise<OpenAIDecisionProofResult> {
  const source = input.source ?? process.env;
  const parsed = proofEnvironmentSchema.safeParse(source);
  if (!parsed.success) {
    throw new OpenAIDecisionProofError("OPENAI_PROOF_UNAVAILABLE", 503);
  }
  if (
    !input.attemptId ||
    !sameExactValue(
      input.attemptId,
      parsed.data.OPENAI_DECISION_AUTHORIZED_ATTEMPT_ID,
    )
  ) {
    throw new OpenAIDecisionProofError("OPENAI_PROOF_UNAUTHORIZED", 401);
  }

  const store = input.store ?? createRuntimeOperationJournalStore(source);
  if (store.durability !== "durable") {
    throw new OpenAIDecisionProofError("OPENAI_PROOF_UNAVAILABLE", 503);
  }

  const submittedAt = new Date().toISOString();
  const submitted = operationDraft({
    occurredAt: submittedAt,
    state: "submitted",
    truthBoundary: "model-unconfirmed",
    authoritativeReadback: {
      state: "not-required",
      providerState: "not-observed",
      matchCodes: [],
    },
    evidenceCodes: [
      "DURABLE_MODEL_CALL_CLAIMED",
      "ONE_ATTEMPT_GATE",
      "NO_MODEL_RETRY",
      "NO_PAYMENT_TOOL_ACCESS",
    ],
  });

  const claim = await claimDurableOperationAttempt({
    store,
    scopeFingerprint: OPENAI_DECISION_PROOF_SCOPE,
    guard: {
      provider: "openai",
      mode: "live-model",
      mutationEnabled: true,
      allowedOperation: "openai.propose_purchase",
      maxMutations: 1,
      oneAttemptOnly: true,
    },
    request: {
      operationRef: OPENAI_DECISION_PROOF_OPERATION_REF,
      provider: "openai",
      mode: "live-model",
      operation: "openai.propose_purchase",
      attempt: 1,
      idempotencyFingerprint: submitted.idempotencyFingerprint!,
    },
    submitted,
  });
  if (!claim.decision.allowed) {
    throw new OpenAIDecisionProofError(
      "OPENAI_PROOF_ALREADY_CLAIMED",
      409,
    );
  }

  const model = new OpenAIDecisionModel({
    apiKey: parsed.data.OPENAI_API_KEY,
    model: parsed.data.OPENAI_DECISION_MODEL,
    enabled: true,
    timeoutMs: 20_000,
    fetchImpl: input.fetchImpl,
  });

  let decision: AuditedPurchaseDecision;
  try {
    decision = await model.decide(buildAtlasPurchaseDecisionInput());
  } catch (error) {
    const failure = classifyFailure(error);
    await appendDurableOperationState({
      store,
      scopeFingerprint: OPENAI_DECISION_PROOF_SCOPE,
      draft: operationDraft({
        occurredAt: new Date().toISOString(),
        state: failure.state,
        truthBoundary: failure.truthBoundary,
        ...(error instanceof OpenAIDecisionError && error.status
          ? { providerHttpStatus: error.status }
          : {}),
        authoritativeReadback: {
          state: "not-required",
          providerState:
            failure.state === "ambiguous" ? "unknown" : "failed",
          matchCodes: [],
        },
        evidenceCodes: failure.evidenceCodes,
      }),
    });
    throw new OpenAIDecisionProofError(
      failure.state === "ambiguous"
        ? "OPENAI_PROOF_AMBIGUOUS"
        : "OPENAI_PROOF_FAILED",
      failure.status,
    );
  }

  const completed = await appendDurableOperationState({
    store,
    scopeFingerprint: OPENAI_DECISION_PROOF_SCOPE,
    draft: operationDraft({
      occurredAt: decision.completedAt,
      state: "provider-accepted",
      truthBoundary: "model-structured-output",
      providerHttpStatus: 200,
      providerCorrelationRef: maskProviderReference(
        "openai_response",
        decision.providerResponseReference ?? decision.outputDigest,
      ),
      responseShape: captureResponseShape(decision),
      authoritativeReadback: {
        state: "not-required",
        providerState: "completed",
        matchCodes: [],
      },
      evidenceCodes: [
        "OPENAI_RESPONSE_COMPLETED",
        "STRICT_STRUCTURED_OUTPUT_VALIDATED",
        "DETERMINISTIC_POLICY_REVERIFIED",
        "MODEL_PROPOSAL_NOT_EXECUTION_AUTHORITY",
        "NO_PAYMENT_PROVIDER_CALL",
      ],
      decisionAudit: decision,
    }),
  });

  const receipt = buildAuditReceipt(
    {
      receiptId: OPENAI_DECISION_PROOF_RECEIPT_ID,
      generatedAt: decision.completedAt,
    },
    completed.journal,
  );
  return {
    decision,
    receipt,
    providerCalls: 1,
    paymentCalls: 0,
    truthBoundary: "model-structured-output",
  };
}

export async function readOpenAIDecisionProof(
  source: Record<string, string | undefined> = process.env,
  store: DurableOperationJournalStore = createRuntimeOperationJournalStore(
    source,
  ),
): Promise<OpenAIDecisionProofResult | null> {
  const journal = await store.read(OPENAI_DECISION_PROOF_SCOPE);
  const decision = [...journal]
    .reverse()
    .find((entry) => entry.decisionAudit)?.decisionAudit;
  if (!decision) return null;

  return {
    decision,
    receipt: buildAuditReceipt(
      {
        receiptId: OPENAI_DECISION_PROOF_RECEIPT_ID,
        generatedAt: journal.at(-1)?.occurredAt ?? decision.completedAt,
      },
      journal,
    ),
    providerCalls: 1,
    paymentCalls: 0,
    truthBoundary: "model-structured-output",
  };
}
