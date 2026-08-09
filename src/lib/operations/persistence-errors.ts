export type OperationJournalPersistenceCode =
  | "JOURNAL_CONFIGURATION_MISSING"
  | "JOURNAL_UNAVAILABLE"
  | "JOURNAL_CAS_CONFLICT";

/** Public-safe persistence error. The database driver error is never retained. */
export class OperationJournalPersistenceError extends Error {
  constructor(readonly code: OperationJournalPersistenceCode) {
    super(code);
    this.name = "OperationJournalPersistenceError";
  }
}
