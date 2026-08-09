import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { assertUiSafePayload } from "@/lib/operations";

describe("deployed Preview journal proof evidence", () => {
  it("records only safe booleans and keeps provider truth separate", () => {
    const evidence = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          "evidence/database/preview-journal-proof-20260808-v2.json",
        ),
        "utf8",
      ),
    );
    const serialized = JSON.stringify(evidence);

    expect(() => assertUiSafePayload(evidence)).not.toThrow();
    expect(evidence).toMatchObject({
      deploymentProtected: true,
      synthetic: true,
      runtimeRoleMatched: true,
      schemaReady: true,
      permissions: {
        select: true,
        insert: true,
        update: false,
        delete: false,
        truncate: false,
        schemaCreate: false,
        temporaryTables: false,
      },
      concurrentClaims: { winners: 1, blocked: 1 },
      persistedAcrossConnections: true,
      providerGatesClosed: true,
      providerCalls: 0,
      modelCalls: 0,
    });
    expect(serialized).not.toMatch(
      /postgres(?:ql)?:|database_url|password|authorization|api.?key/i,
    );
  });
});
