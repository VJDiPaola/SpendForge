import { describe, expect, it } from "vitest";

import {
  appendRunEvent,
  assertCanonicalEventLog,
  transitionRunStatus,
} from "@/lib/domain";
import type { RunEvent } from "@/lib/domain";

describe("canonical run events", () => {
  it("appends without mutating prior history", () => {
    const first = appendRunEvent([], {
      runId: "run_test",
      type: "run.started",
      occurredAt: "2026-08-08T18:00:00.000Z",
      publicPayload: { mode: "fixture" },
    });
    const second = appendRunEvent(first, {
      runId: "run_test",
      type: "plan.created",
      occurredAt: "2026-08-08T18:00:01.000Z",
      publicPayload: { offers: 5 },
    });

    expect(first).toHaveLength(1);
    expect(second.map((event) => event.sequence)).toEqual([1, 2]);
    assertCanonicalEventLog(second, "run_test");
  });

  it("rejects sequence gaps and chronological rewrites", () => {
    const malformed: RunEvent[] = [
      {
        sequence: 2,
        runId: "run_test",
        type: "run.started",
        occurredAt: "2026-08-08T18:00:00.000Z",
        publicPayload: {},
      },
    ];
    expect(() => assertCanonicalEventLog(malformed)).toThrow(/canonical/);

    const first = appendRunEvent([], {
      runId: "run_test",
      type: "run.started",
      occurredAt: "2026-08-08T18:00:01.000Z",
      publicPayload: {},
    });
    expect(() =>
      appendRunEvent(first, {
        runId: "run_test",
        type: "plan.created",
        occurredAt: "2026-08-08T18:00:00.000Z",
        publicPayload: {},
      }),
    ).toThrow(/chronological/);
  });

  it("rejects non-JSON public payloads", () => {
    expect(() =>
      appendRunEvent([], {
        runId: "run_test",
        type: "run.started",
        occurredAt: "2026-08-08T18:00:00.000Z",
        publicPayload: { unsafe: BigInt(1) } as never,
      }),
    ).toThrow(/non-JSON/);
  });

  it("guards run-level transitions without treating declined offers as run states", () => {
    expect(transitionRunStatus("draft", "planning")).toBe("planning");
    expect(() => transitionRunStatus("completed", "purchasing")).toThrow(
      /Invalid run status transition/,
    );
  });
});
