import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getJournalReadiness: vi.fn(),
}));

vi.mock("@/lib/operations/readiness", () => ({
  JournalReadinessError: class JournalReadinessError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
  getJournalReadiness: mocks.getJournalReadiness,
}));

import { GET } from "@/app/api/health/journal/route";

describe("read-only journal readiness route", () => {
  it("returns only safe permission booleans", async () => {
    mocks.getJournalReadiness.mockResolvedValueOnce({
      ok: true,
      environment: "preview",
      configured: true,
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
      truthBoundary: "read-only-database-configuration-check",
      providerCalls: 0,
    });

    const response = await GET();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(JSON.parse(text)).toMatchObject({
      ok: true,
      runtimeRoleMatched: true,
      schemaReady: true,
      providerCalls: 0,
    });
    expect(text).not.toMatch(/postgres|password|database_url|api.?key/i);
  });

  it("fails with one stable code and no provider detail", async () => {
    mocks.getJournalReadiness.mockRejectedValueOnce(new Error("discard me"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: "JOURNAL_READINESS_UNAVAILABLE",
      providerCalls: 0,
    });
  });
});
