import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertCanonicalOperationJournal,
  assertUiSafePayload,
  buildRainCardAuditReceipt,
} from "@/lib/operations";

describe("durable Rain sandbox evidence", () => {
  it("remains sequential, redacted, and explicit about its truth boundary", () => {
    const evidence = JSON.parse(
      readFileSync(
        join(process.cwd(), "evidence/rain-sandbox/operation-journal.json"),
        "utf8",
      ),
    ) as { entries: Array<Record<string, unknown>> };
    const serialized = JSON.stringify(evidence);

    expect(() => assertUiSafePayload(evidence)).not.toThrow();
    expect(evidence.entries.map((entry) => entry.sequence)).toEqual(
      Array.from({ length: evidence.entries.length }, (_, index) => index + 1),
    );
    expect(serialized).not.toMatch(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    );
    expect(serialized).not.toMatch(/encryptedPan|encryptedCvc|sessionid/i);
    expect(evidence.entries.at(-1)).toMatchObject({
      operationRef: "op_rain_card_issue_20260808_v2",
      state: "provider-confirmed",
      truthBoundary: "sandbox-authoritative",
      providerCorrelationRef: "card:4432...fe71",
    });
  });

  it("serves the actual card receipt as a canonical verified capture", () => {
    const receipt = buildRainCardAuditReceipt();
    expect(() => assertCanonicalOperationJournal(receipt.operations)).not.toThrow();
    expect(receipt.truthBoundary).toBe("sandbox-authoritative");
    expect(receipt.operations.at(-1)).toMatchObject({
      state: "provider-confirmed",
      evidenceCodes: expect.arrayContaining([
        "CARD_STATUS_ACTIVE",
        "CARD_TYPE_VIRTUAL",
        "CAP_REQUEST_ONLY",
        "VERIFIED_REDACTED_CAPTURE",
      ]),
    });
  });
});
