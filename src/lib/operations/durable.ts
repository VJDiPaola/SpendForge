import {
  evaluateOperationGate,
  type OperationGateDecision,
  type OperationGateRequest,
  type ProviderOperationGuard,
} from "./gates";
import {
  appendOperationEntry,
  appendToDurableJournal,
  type DurableOperationJournalStore,
} from "./journal";
import { OperationJournalPersistenceError } from "./persistence-errors";
import {
  operationEntryDraftSchema,
  type OperationEntryDraft,
  type OperationJournalEntry,
} from "./schemas";

export type DurableOperationClaim = {
  decision: OperationGateDecision;
  entry?: OperationJournalEntry;
  journal: readonly OperationJournalEntry[];
};

function duplicateDecision(
  journal: readonly OperationJournalEntry[],
  request: OperationGateRequest,
): OperationGateDecision {
  const duplicate = journal.find(
    (entry) =>
      entry.idempotencyFingerprint === request.idempotencyFingerprint &&
      entry.mutation &&
      [
        "submitted",
        "provider-accepted",
        "provider-pending",
        "readback-pending",
        "provider-confirmed",
        "provider-declined",
        "provider-failed",
        "ambiguous",
        "closed",
      ].includes(entry.state),
  );

  return {
    allowed: false,
    codes: ["DUPLICATE_OPERATION"],
    ...(duplicate ? { duplicateOperationRef: duplicate.operationRef } : {}),
  };
}

/**
 * Atomically persists the submitted marker before a provider mutation. A CAS
 * race is treated as a duplicate and never retried into an outbound call.
 */
export async function claimDurableOperationAttempt(input: {
  store: DurableOperationJournalStore;
  scopeFingerprint: string;
  guard: ProviderOperationGuard;
  request: OperationGateRequest;
  submitted: OperationEntryDraft;
}): Promise<DurableOperationClaim> {
  const draft = operationEntryDraftSchema.parse(input.submitted);
  if (
    draft.state !== "submitted" ||
    !draft.mutation ||
    draft.operationRef !== input.request.operationRef ||
    draft.operation !== input.request.operation ||
    draft.provider !== input.request.provider ||
    draft.mode !== input.request.mode ||
    draft.idempotencyFingerprint !== input.request.idempotencyFingerprint ||
    JSON.stringify(draft.amount) !== JSON.stringify(input.request.amount)
  ) {
    throw new Error("Durable operation claim metadata is inconsistent");
  }

  const journal = await input.store.read(input.scopeFingerprint);
  const decision = evaluateOperationGate({
    config: input.guard,
    request: input.request,
    journal,
  });
  if (!decision.allowed) return { decision, journal };

  const next = appendOperationEntry(journal, draft);
  const entry = next[next.length - 1];
  try {
    await input.store.append(input.scopeFingerprint, journal.length, entry);
  } catch (error) {
    if (
      error instanceof OperationJournalPersistenceError &&
      error.code === "JOURNAL_CAS_CONFLICT"
    ) {
      const refreshed = await input.store.read(input.scopeFingerprint);
      return {
        decision: duplicateDecision(refreshed, input.request),
        journal: refreshed,
      };
    }
    throw error;
  }

  return {
    decision: { allowed: true, codes: ["GUARD_ALLOWED"] },
    entry,
    journal: next,
  };
}

export async function appendDurableOperationState(input: {
  store: DurableOperationJournalStore;
  scopeFingerprint: string;
  draft: OperationEntryDraft;
}): Promise<{
  entry: OperationJournalEntry;
  journal: readonly OperationJournalEntry[];
}> {
  const entry = await appendToDurableJournal(
    input.store,
    input.scopeFingerprint,
    input.draft,
  );
  const journal = await input.store.read(input.scopeFingerprint);
  return { entry, journal };
}
