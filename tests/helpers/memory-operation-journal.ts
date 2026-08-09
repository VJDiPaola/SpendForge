import {
  OperationJournalPersistenceError,
  type DurableOperationJournalStore,
  type OperationJournalEntry,
} from "@/lib/operations";

/** Deterministic CAS fake. It is never selected by deployed application code. */
export class MemoryOperationJournalStore
  implements DurableOperationJournalStore
{
  readonly durability = "memory" as const;

  private readonly entriesByScope = new Map<
    string,
    OperationJournalEntry[]
  >();
  private readonly submittedFingerprints = new Set<string>();

  async read(scopeFingerprint: string) {
    return [...(this.entriesByScope.get(scopeFingerprint) ?? [])];
  }

  async append(
    scopeFingerprint: string,
    expectedPreviousSequence: number,
    entry: OperationJournalEntry,
  ): Promise<void> {
    const entries = this.entriesByScope.get(scopeFingerprint) ?? [];
    if (
      entries.length !== expectedPreviousSequence ||
      entry.sequence !== expectedPreviousSequence + 1
    ) {
      throw new OperationJournalPersistenceError("JOURNAL_CAS_CONFLICT");
    }

    if (
      entry.mutation &&
      entry.state === "submitted" &&
      entry.idempotencyFingerprint &&
      this.submittedFingerprints.has(entry.idempotencyFingerprint)
    ) {
      throw new OperationJournalPersistenceError("JOURNAL_CAS_CONFLICT");
    }

    if (
      entry.mutation &&
      entry.state === "submitted" &&
      entry.idempotencyFingerprint
    ) {
      this.submittedFingerprints.add(entry.idempotencyFingerprint);
    }
    this.entriesByScope.set(scopeFingerprint, [...entries, entry]);
  }
}

/** Persists the initial claim, then simulates a database outage. */
export class FinalizationUnavailableJournalStore extends MemoryOperationJournalStore {
  private appendCount = 0;

  override async append(
    scopeFingerprint: string,
    expectedPreviousSequence: number,
    entry: OperationJournalEntry,
  ): Promise<void> {
    this.appendCount += 1;
    if (this.appendCount > 1) {
      throw new OperationJournalPersistenceError("JOURNAL_UNAVAILABLE");
    }
    await super.append(scopeFingerprint, expectedPreviousSequence, entry);
  }
}
