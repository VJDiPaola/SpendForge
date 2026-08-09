import {
  claimDurableOperationAttempt,
  deriveIdempotencyFingerprint,
  type DurableOperationJournalStore,
  type OperationEntryDraft,
  type OperationJournalEntry,
  type RecoveryReferenceKind,
} from "@/lib/operations";
import { createRuntimeOperationJournalStore } from "@/lib/operations/postgres-store";

import {
  configuredAttemptContext,
  operationMetadata,
  resumeReadMetadata,
  RAIN_NORTHSTAR_RUN_SCOPE,
} from "./constants";
import { RainNorthstarProofError } from "./provider";

export function fingerprintFor(kind: keyof typeof operationMetadata) {
  const metadata = operationMetadata[kind];
  return deriveIdempotencyFingerprint({
    missionRef: "mission_atlas_launch_v1",
    runRef: `run_atlas_rain_northstar_live_v1:${configuredAttemptContext()}`,
    offerRef: metadata.offerRef,
    provider: "rain",
    operation: metadata.operation as
      | "rain.issue_scoped_card"
      | "rain.authorize_transaction"
      | "rain.settle_transaction",
    generation: 1,
  });
}

export function draft(
  kind: keyof typeof operationMetadata,
  input: Omit<
    OperationEntryDraft,
    | "operationRef"
    | "provider"
    | "mode"
    | "operation"
    | "endpoint"
    | "mutation"
    | "idempotencyFingerprint"
    | "amount"
  >,
): OperationEntryDraft {
  const metadata = operationMetadata[kind];
  return {
    operationRef: metadata.operationRef,
    provider: "rain",
    mode: "live-sandbox",
    operation: metadata.operation,
    endpoint: metadata.endpoint,
    mutation: true,
    idempotencyFingerprint: fingerprintFor(kind),
    amount: metadata.amount,
    ...input,
  };
}

export function resumeReadDraft(
  input: Omit<
    OperationEntryDraft,
    | "operationRef"
    | "provider"
    | "mode"
    | "operation"
    | "endpoint"
    | "mutation"
    | "idempotencyFingerprint"
    | "amount"
  >,
): OperationEntryDraft {
  return {
    operationRef: resumeReadMetadata.operationRef,
    provider: "rain",
    mode: "live-sandbox",
    operation: resumeReadMetadata.operation,
    endpoint: resumeReadMetadata.endpoint,
    mutation: false,
    amount: resumeReadMetadata.amount,
    ...input,
  };
}

export async function claim(
  kind: keyof typeof operationMetadata,
  store: DurableOperationJournalStore,
) {
  const submitted = draft(kind, {
    occurredAt: new Date().toISOString(),
    state: "submitted",
    truthBoundary: "sandbox-unconfirmed",
    authoritativeReadback: {
      state: "not-started",
      providerState: "not-observed",
      matchCodes: [],
    },
    evidenceCodes: [
      "DURABLE_MUTATION_CLAIM",
      "ONE_ATTEMPT_GATE",
      "RUN_WIDE_CAP_CHECKED",
    ],
  });
  const metadata = operationMetadata[kind];
  const result = await claimDurableOperationAttempt({
    store,
    scopeFingerprint: RAIN_NORTHSTAR_RUN_SCOPE,
    guard: {
      provider: "rain",
      mode: "live-sandbox",
      mutationEnabled: true,
      allowedOperation: metadata.operation as
        | "rain.issue_scoped_card"
        | "rain.authorize_transaction"
        | "rain.settle_transaction",
      maxMutations: 3,
      oneAttemptOnly: true,
      spendCap: metadata.amount,
      cumulativeSpendCap: {
        amount: "25",
        decimals: 2,
        asset: "USD",
        network: "rain-sandbox",
      },
    },
    request: {
      operationRef: metadata.operationRef,
      provider: "rain",
      mode: "live-sandbox",
      operation: metadata.operation as
        | "rain.issue_scoped_card"
        | "rain.authorize_transaction"
        | "rain.settle_transaction",
      attempt: 1,
      idempotencyFingerprint: fingerprintFor(kind),
      amount: metadata.amount,
    },
    submitted,
  });
  if (!result.decision.allowed) {
    throw new RainNorthstarProofError("RAIN_PROOF_ALREADY_CLAIMED", 409);
  }
}

export function recoveryEnvelope(
  journal: readonly OperationJournalEntry[],
  kind: RecoveryReferenceKind,
) {
  return [...journal]
    .reverse()
    .find((entry) => entry.recoveryEnvelope?.kind === kind)?.recoveryEnvelope;
}

export async function durableStoreFor(
  source: Record<string, string | undefined>,
  supplied?: DurableOperationJournalStore,
) {
  let store: DurableOperationJournalStore;
  try {
    store = supplied ?? createRuntimeOperationJournalStore(source);
  } catch {
    throw new RainNorthstarProofError("RAIN_JOURNAL_UNAVAILABLE", 503);
  }
  if (store.durability !== "durable") {
    throw new RainNorthstarProofError("RAIN_RECONCILIATION_UNAVAILABLE", 503);
  }
  return store;
}

