import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  appendOperationEntry,
  deriveEvidenceFingerprint,
  OperationJournalPersistenceError,
} from "@/lib/operations";
import {
  appendOperationJournalSql,
  createRuntimeOperationJournalStore,
  PostgresOperationJournalStore,
  readOperationJournalSql,
  type OperationJournalQueryExecutor,
} from "@/lib/operations/postgres-store";

function entry() {
  return appendOperationEntry([], {
    operationRef: "op_rain_postgres_claim_v1",
    occurredAt: "2026-08-08T20:00:00.000Z",
    provider: "rain",
    mode: "live-sandbox",
    operation: "rain.fund_collateral",
    endpoint: "/simulate/collateral/fund",
    mutation: true,
    state: "submitted",
    truthBoundary: "sandbox-unconfirmed",
    idempotencyFingerprint: deriveEvidenceFingerprint("postgres-claim-v1"),
    amount: {
      amount: "100000",
      decimals: 2,
      asset: "rUSD",
      network: "rain-sandbox",
    },
    authoritativeReadback: {
      state: "not-started",
      providerState: "not-observed",
      matchCodes: [],
    },
    evidenceCodes: ["DURABLE_MUTATION_CLAIM"],
  })[0];
}

describe("Postgres operation journal store", () => {
  it("uses parameterized CAS SQL and reads the canonical JSON payload", async () => {
    const candidate = entry();
    const query = vi.fn(
      async (...args: [sql: string, params: readonly unknown[]]) => {
        const [sql] = args;
        if (sql === appendOperationJournalSql) {
          return [{ sequence: candidate.sequence }];
        }
        if (sql === readOperationJournalSql) {
          return [{ entry_json: candidate }];
        }
        throw new Error("unexpected test query");
      },
    );
    const store = new PostgresOperationJournalStore({ query });

    await store.append(
      candidate.idempotencyFingerprint!,
      0,
      candidate,
    );
    await expect(
      store.read(candidate.idempotencyFingerprint!),
    ).resolves.toEqual([candidate]);

    const appendCall = query.mock.calls.find(
      ([sql]) => sql === appendOperationJournalSql,
    );
    expect(appendCall?.[1]).toHaveLength(10);
    expect(appendOperationJournalSql).toContain("ON CONFLICT DO NOTHING");
    expect(appendOperationJournalSql).not.toContain(
      candidate.idempotencyFingerprint,
    );
  });

  it("maps an empty INSERT result to a CAS conflict", async () => {
    const candidate = entry();
    const executor: OperationJournalQueryExecutor = {
      query: vi.fn().mockResolvedValue([]),
    };
    const store = new PostgresOperationJournalStore(executor);

    await expect(
      store.append(candidate.idempotencyFingerprint!, 0, candidate),
    ).rejects.toMatchObject({
      code: "JOURNAL_CAS_CONFLICT",
    } satisfies Partial<OperationJournalPersistenceError>);
  });

  it("fails closed with a safe code when configuration or the table is absent", async () => {
    expect(() => createRuntimeOperationJournalStore({})).toThrowError(
      expect.objectContaining({ code: "JOURNAL_CONFIGURATION_MISSING" }),
    );

    const candidate = entry();
    const store = new PostgresOperationJournalStore({
      query: vi.fn().mockRejectedValue(new Error("relation missing")),
    });
    await expect(
      store.read(candidate.idempotencyFingerprint!),
    ).rejects.toMatchObject({
      code: "JOURNAL_UNAVAILABLE",
    } satisfies Partial<OperationJournalPersistenceError>);
  });

  it("maps malformed persisted rows to a public-safe unavailable error", async () => {
    const candidate = entry();
    const store = new PostgresOperationJournalStore({
      query: vi.fn().mockResolvedValue([
        { entry_json: { ...candidate, operationRef: "raw-invalid-value" } },
      ]),
    });

    await expect(
      store.read(candidate.idempotencyFingerprint!),
    ).rejects.toMatchObject({
      code: "JOURNAL_UNAVAILABLE",
      message: "JOURNAL_UNAVAILABLE",
    });
  });
});
