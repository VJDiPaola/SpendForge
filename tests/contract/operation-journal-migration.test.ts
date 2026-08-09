import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../migrations/001_provider_operation_journal.sql", import.meta.url),
  "utf8",
);

describe("operation journal migration contract", () => {
  it("defines the CAS and immutable-journal database barriers", () => {
    expect(migration).toContain(
      "PRIMARY KEY (scope_fingerprint, sequence)",
    );
    expect(migration).toContain(
      "WHERE mutation = true\n    AND operation_state = 'submitted'",
    );
    expect(migration).toContain(
      "UNIQUE (scope_fingerprint, entry_ref)",
    );
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
    expect(migration).toContain("BEFORE TRUNCATE");
    expect(migration).toContain("REVOKE UPDATE, DELETE, TRUNCATE");
  });

  it("mirrors security-critical JSON fields into constrained columns", () => {
    for (const field of [
      "sequence",
      "entryRef",
      "operationRef",
      "state",
      "mutation",
      "occurredAt",
      "idempotencyFingerprint",
    ]) {
      expect(migration).toContain(`entry_json ->> '${field}'`);
    }
    expect(migration).toContain("operation_state IN (");
    expect(migration).toContain(
      "CHECK (NOT mutation OR idempotency_fingerprint IS NOT NULL)",
    );
  });
});
