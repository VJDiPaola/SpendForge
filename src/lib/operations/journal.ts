import {
  deriveEvidenceFingerprint,
} from "./fingerprint";
import { assertUiSafePayload } from "./redaction";
import {
  mutationOperationKindSchema,
  operationEndpointByKind,
  operationEntryDraftSchema,
  operationJournalEntrySchema,
  type OperationEntryDraft,
  type OperationJournalEntry,
  type OperationState,
} from "./schemas";

const mutationOperations = new Set(
  mutationOperationKindSchema.options as readonly string[],
);

const executedStates = new Set<OperationState>([
  "submitted",
  "provider-accepted",
  "provider-pending",
  "readback-pending",
  "provider-confirmed",
  "provider-declined",
  "provider-failed",
  "ambiguous",
  "closed",
]);

const allowedTransitions: Readonly<Record<OperationState, readonly OperationState[]>> = {
  planned: ["gate-passed", "gate-blocked", "closed"],
  "gate-passed": ["submitted", "gate-blocked", "closed"],
  "gate-blocked": ["closed"],
  submitted: [
    "provider-accepted",
    "provider-pending",
    "readback-pending",
    "provider-confirmed",
    "provider-declined",
    "provider-failed",
    "ambiguous",
  ],
  "provider-accepted": [
    "provider-pending",
    "readback-pending",
    "provider-confirmed",
    "provider-declined",
    "provider-failed",
    "ambiguous",
  ],
  "provider-pending": [
    "readback-pending",
    "provider-confirmed",
    "provider-declined",
    "provider-failed",
    "ambiguous",
  ],
  "readback-pending": [
    "provider-pending",
    "provider-confirmed",
    "provider-declined",
    "provider-failed",
    "ambiguous",
  ],
  "provider-confirmed": ["closed"],
  "provider-declined": ["closed"],
  "provider-failed": ["closed"],
  ambiguous: ["readback-pending", "closed"],
  closed: [],
};

function providerForOperation(operation: OperationEntryDraft["operation"]) {
  if (operation.startsWith("rain.")) return "rain";
  if (operation.startsWith("monad_x402.")) return "monad_x402";
  return "openai";
}

function expectedMode(provider: OperationEntryDraft["provider"]) {
  if (provider === "rain") return "live-sandbox";
  if (provider === "monad_x402") return "testnet";
  return "live-model";
}

function canonicalEntryPayload(
  sequence: number,
  draft: OperationEntryDraft,
): string {
  return JSON.stringify({ schemaVersion: 1, sequence, ...draft });
}

function expectedEntryRef(entry: Omit<OperationJournalEntry, "entryRef">) {
  return `entry_${deriveEvidenceFingerprint(JSON.stringify(entry)).slice(7, 31)}`;
}

function validateDraftSemantics(draft: OperationEntryDraft): void {
  if (providerForOperation(draft.operation) !== draft.provider) {
    throw new Error("Operation does not belong to the selected provider");
  }
  if (operationEndpointByKind[draft.operation] !== draft.endpoint) {
    throw new Error("Operation endpoint must use the redacted route template");
  }
  if (draft.mode !== "fixture" && draft.mode !== expectedMode(draft.provider)) {
    throw new Error("Provider and evidence mode are incompatible");
  }
  if (draft.mode === "fixture" && draft.mutation) {
    throw new Error("Fixture evidence cannot record a provider mutation");
  }
  if (
    draft.mode !== "fixture" &&
    draft.mutation !== mutationOperations.has(draft.operation)
  ) {
    throw new Error("Mutation flag does not match the provider operation");
  }
  if (draft.mutation && !draft.idempotencyFingerprint) {
    throw new Error("Every provider mutation needs an idempotency fingerprint");
  }
  if (
    draft.state === "provider-confirmed" &&
    (draft.authoritativeReadback.state !== "matched-terminal" ||
      draft.authoritativeReadback.providerState !== "completed")
  ) {
    throw new Error("Provider success requires terminal authoritative readback");
  }
  if (
    ["sandbox-authoritative", "testnet-authoritative"].includes(
      draft.truthBoundary,
    ) &&
    draft.authoritativeReadback.state !== "matched-terminal"
  ) {
    throw new Error("Authoritative truth requires matched terminal readback");
  }
  if (
    draft.truthBoundary === "fixture-only" &&
    draft.mode !== "fixture"
  ) {
    throw new Error("Fixture truth may only be used in fixture mode");
  }
  if (
    draft.truthBoundary.startsWith("sandbox-") &&
    draft.mode !== "live-sandbox"
  ) {
    throw new Error("Sandbox truth requires live-sandbox mode");
  }
  if (
    draft.truthBoundary.startsWith("testnet-") &&
    draft.mode !== "testnet"
  ) {
    throw new Error("Testnet truth requires testnet mode");
  }
  if (
    draft.truthBoundary.startsWith("model-") &&
    draft.mode !== "live-model"
  ) {
    throw new Error("Model truth requires live-model mode");
  }
  if (draft.operation === "openai.propose_purchase") {
    if (draft.amount) {
      throw new Error("Model proposal operations do not record a payment amount");
    }
    if (
      draft.truthBoundary === "model-structured-output" &&
      !draft.decisionAudit
    ) {
      throw new Error("Structured model truth requires a decision audit");
    }
  } else if (draft.decisionAudit) {
    throw new Error("Decision audits may only attach to model operations");
  }
  if (
    draft.deliveryContentHash &&
    draft.operation !== "monad_x402.read_receipt"
  ) {
    throw new Error("Delivery hashes may only attach to x402 receipt evidence");
  }
  if (draft.recoveryEnvelope) {
    const expectedProvider = draft.recoveryEnvelope.kind.startsWith("rain_")
      ? "rain"
      : "monad_x402";
    if (draft.provider !== expectedProvider || draft.mode === "fixture") {
      throw new Error("Recovery references must match a live provider operation");
    }
    if (["planned", "gate-passed", "gate-blocked", "submitted"].includes(draft.state)) {
      throw new Error("Recovery references require an observed provider reference");
    }
  }
  if (
    draft.authoritativeReadback.state !== "not-required" &&
    draft.authoritativeReadback.state !== "not-started" &&
    !draft.authoritativeReadback.observedAt
  ) {
    throw new Error("Readback observations require a timestamp");
  }

  assertUiSafePayload(draft);
}

function assertOperationMetadataStable(
  previous: OperationJournalEntry,
  next: OperationEntryDraft,
): void {
  const fields = [
    "provider",
    "mode",
    "operation",
    "endpoint",
    "mutation",
    "idempotencyFingerprint",
  ] as const;
  for (const field of fields) {
    if (previous[field] !== next[field]) {
      throw new Error(`Operation metadata cannot change: ${field}`);
    }
  }
  if (JSON.stringify(previous.amount) !== JSON.stringify(next.amount)) {
    throw new Error("Operation metadata cannot change: amount");
  }
}

function assertTransition(previous: OperationState, next: OperationState): void {
  if (!allowedTransitions[previous].includes(next)) {
    throw new Error(`Invalid operation state transition: ${previous} -> ${next}`);
  }
}

export function assertCanonicalOperationJournal(
  entries: readonly OperationJournalEntry[],
): void {
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  const previousByOperation = new Map<string, OperationJournalEntry>();

  entries.forEach((candidate, index) => {
    const entry = operationJournalEntrySchema.parse(candidate);
    validateDraftSemantics(entry);

    if (entry.sequence !== index + 1) {
      throw new Error("Operation journal sequence is not canonical");
    }
    const occurredAt = Date.parse(entry.occurredAt);
    if (occurredAt < previousTimestamp) {
      throw new Error("Operation journal timestamps are out of order");
    }
    previousTimestamp = occurredAt;

    const { entryRef, ...withoutRefCandidate } = entry;
    const withoutRef = operationJournalEntrySchema
      .omit({ entryRef: true })
      .parse(withoutRefCandidate);
    if (entryRef !== expectedEntryRef(withoutRef)) {
      throw new Error("Operation journal entry fingerprint is invalid");
    }

    const previous = previousByOperation.get(entry.operationRef);
    if (previous) {
      assertOperationMetadataStable(previous, entry);
      assertTransition(previous.state, entry.state);
    }
    previousByOperation.set(entry.operationRef, entry);
  });
}

export function appendOperationEntry(
  entries: readonly OperationJournalEntry[],
  candidate: OperationEntryDraft,
): OperationJournalEntry[] {
  assertCanonicalOperationJournal(entries);
  const draft = operationEntryDraftSchema.parse(candidate);
  validateDraftSemantics(draft);

  const previous = [...entries]
    .reverse()
    .find((entry) => entry.operationRef === draft.operationRef);
  if (previous) {
    assertOperationMetadataStable(previous, draft);
    assertTransition(previous.state, draft.state);
  }

  const last = entries.at(-1);
  if (last && Date.parse(draft.occurredAt) < Date.parse(last.occurredAt)) {
    throw new Error("Operation journal entries cannot rewrite chronology");
  }

  if (draft.idempotencyFingerprint && executedStates.has(draft.state)) {
    const duplicate = entries.find(
      (entry) =>
        entry.operationRef !== draft.operationRef &&
        entry.idempotencyFingerprint === draft.idempotencyFingerprint &&
        executedStates.has(entry.state),
    );
    if (duplicate) {
      throw new Error("Duplicate operation fingerprint already executed");
    }
  }

  const sequence = entries.length + 1;
  const withoutRef = operationJournalEntrySchema
    .omit({ entryRef: true })
    .parse({
      schemaVersion: 1,
      sequence,
      ...draft,
    });
  const entry = operationJournalEntrySchema.parse({
    ...withoutRef,
    entryRef: expectedEntryRef(withoutRef),
  });

  assertUiSafePayload(entry);
  return [...entries, entry];
}

export interface DurableOperationJournalStore {
  readonly durability: "memory" | "durable";
  read(scopeFingerprint: string): Promise<readonly OperationJournalEntry[]>;
  append(
    scopeFingerprint: string,
    expectedPreviousSequence: number,
    entry: OperationJournalEntry,
  ): Promise<void>;
}

/**
 * Stores must implement append with compare-and-set semantics. That database
 * constraint is the final duplicate/concurrency barrier in deployed mode.
 */
export async function appendToDurableJournal(
  store: DurableOperationJournalStore,
  scopeFingerprint: string,
  draft: OperationEntryDraft,
): Promise<OperationJournalEntry> {
  const current = await store.read(scopeFingerprint);
  const next = appendOperationEntry(current, draft);
  const entry = next[next.length - 1];
  await store.append(scopeFingerprint, current.length, entry);
  return entry;
}

export { canonicalEntryPayload };
