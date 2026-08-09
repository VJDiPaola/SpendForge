import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { z } from "zod";

import { databaseUrlSchema } from "./database-url";
import {
  assertCanonicalOperationJournal,
  type DurableOperationJournalStore,
} from "./journal";
import { OperationJournalPersistenceError } from "./persistence-errors";
import {
  fingerprintSchema,
  operationJournalEntrySchema,
  type OperationJournalEntry,
} from "./schemas";

export const OPERATION_JOURNAL_TABLE =
  "spendforge_operation_journal_v1" as const;

export const readOperationJournalSql = `
SELECT entry_json
FROM public.spendforge_operation_journal_v1
WHERE scope_fingerprint = $1
ORDER BY sequence ASC
`;

export const appendOperationJournalSql = `
WITH scope_state AS (
  SELECT COALESCE(MAX(sequence), 0)::integer AS previous_sequence
  FROM public.spendforge_operation_journal_v1
  WHERE scope_fingerprint = $1
), inserted AS (
  INSERT INTO public.spendforge_operation_journal_v1 (
    scope_fingerprint,
    sequence,
    entry_ref,
    operation_ref,
    idempotency_fingerprint,
    operation_state,
    mutation,
    occurred_at,
    entry_json
  )
  SELECT
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8::timestamptz,
    $9::jsonb
  FROM scope_state
  WHERE previous_sequence = $10
  ON CONFLICT DO NOTHING
  RETURNING sequence
)
SELECT sequence FROM inserted
`;

export interface OperationJournalQueryExecutor {
  query(sql: string, params: readonly unknown[]): Promise<unknown>;
}

const readRowsSchema = z.array(
  z
    .object({
      entry_json: z.unknown(),
    })
    .strip(),
);

const appendRowsSchema = z.array(
  z
    .object({
      sequence: z.coerce.number().int().positive(),
    })
    .strip(),
);

function safeQueryFailure(): OperationJournalPersistenceError {
  return new OperationJournalPersistenceError("JOURNAL_UNAVAILABLE");
}

export class PostgresOperationJournalStore
  implements DurableOperationJournalStore
{
  readonly durability = "durable" as const;

  constructor(private readonly executor: OperationJournalQueryExecutor) {}

  async read(
    scopeFingerprint: string,
  ): Promise<readonly OperationJournalEntry[]> {
    const scope = fingerprintSchema.parse(scopeFingerprint);

    let result: unknown;
    try {
      result = await this.executor.query(readOperationJournalSql, [scope]);
    } catch {
      throw safeQueryFailure();
    }

    const rows = readRowsSchema.safeParse(result);
    if (!rows.success) throw safeQueryFailure();

    try {
      const entries = rows.data.map((row) =>
        operationJournalEntrySchema.parse(row.entry_json),
      );
      assertCanonicalOperationJournal(entries);
      return entries;
    } catch {
      throw safeQueryFailure();
    }
  }

  async append(
    scopeFingerprint: string,
    expectedPreviousSequence: number,
    candidate: OperationJournalEntry,
  ): Promise<void> {
    const scope = fingerprintSchema.parse(scopeFingerprint);
    const entry = operationJournalEntrySchema.parse(candidate);
    if (
      !Number.isInteger(expectedPreviousSequence) ||
      expectedPreviousSequence < 0 ||
      entry.sequence !== expectedPreviousSequence + 1
    ) {
      throw new OperationJournalPersistenceError("JOURNAL_CAS_CONFLICT");
    }

    let result: unknown;
    try {
      result = await this.executor.query(appendOperationJournalSql, [
        scope,
        entry.sequence,
        entry.entryRef,
        entry.operationRef,
        entry.idempotencyFingerprint ?? null,
        entry.state,
        entry.mutation,
        entry.occurredAt,
        JSON.stringify(entry),
        expectedPreviousSequence,
      ]);
    } catch {
      throw safeQueryFailure();
    }

    const rows = appendRowsSchema.safeParse(result);
    if (!rows.success) throw safeQueryFailure();
    if (rows.data.length !== 1 || rows.data[0].sequence !== entry.sequence) {
      throw new OperationJournalPersistenceError("JOURNAL_CAS_CONFLICT");
    }
  }
}

class NeonOperationJournalQueryExecutor
  implements OperationJournalQueryExecutor
{
  constructor(private readonly sql: NeonQueryFunction<false, false>) {}

  async query(sql: string, params: readonly unknown[]): Promise<unknown> {
    return this.sql.query(sql, [...params], {
      fetchOptions: { signal: AbortSignal.timeout(8_000) },
    });
  }
}

/**
 * Creates the deployed store lazily. Missing or invalid configuration throws a
 * public-safe error before the Neon client or any provider adapter is called.
 */
export function createRuntimeOperationJournalStore(
  source: Record<string, string | undefined> = process.env,
): PostgresOperationJournalStore {
  const parsed = databaseUrlSchema.safeParse(source.DATABASE_URL);
  if (!parsed.success) {
    throw new OperationJournalPersistenceError(
      "JOURNAL_CONFIGURATION_MISSING",
    );
  }

  const sql = neon(parsed.data);
  return new PostgresOperationJournalStore(
    new NeonOperationJournalQueryExecutor(sql),
  );
}
