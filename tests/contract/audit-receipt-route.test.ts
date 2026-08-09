import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/audit/receipts/[receiptId]/route";
import {
  ATLAS_AGENT_DECISION_RECEIPT_ID,
  atlasDecisionReceiptSchema,
} from "@/lib/demo";
import {
  auditReceiptSchema,
  RAIN_CARD_AUDIT_RECEIPT_ID,
  SYNTHETIC_AUDIT_RECEIPT_ID,
} from "@/lib/operations";

describe("downloadable audit receipt route", () => {
  it("returns a no-store, attachment-safe synthetic receipt without provider calls", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET(
      new Request(
        `https://spendforge.example/api/audit/receipts/${SYNTHETIC_AUDIT_RECEIPT_ID}`,
      ),
      { params: Promise.resolve({ receiptId: SYNTHETIC_AUDIT_RECEIPT_ID }) },
    );
    const receipt = auditReceiptSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="spendforge-audit-atlas-fixture-v1.json"',
    );
    expect(response.headers.get("x-spendforge-evidence-mode")).toBe("fixture");
    expect(receipt).toMatchObject({
      receiptId: SYNTHETIC_AUDIT_RECEIPT_ID,
      modes: ["fixture"],
      truthBoundary: "fixture-only",
      redacted: true,
      synthetic: true,
      disclosureCode: "FIXTURE_NO_PROVIDER_CALL",
    });
    expect(receipt.summary.mutationCount).toBe(0);
    expect(receipt.summary.authoritativeTerminalCount).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the redacted authoritative card-issuance receipt without making a provider call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET(
      new Request(
        `https://spendforge.example/api/audit/receipts/${RAIN_CARD_AUDIT_RECEIPT_ID}`,
      ),
      { params: Promise.resolve({ receiptId: RAIN_CARD_AUDIT_RECEIPT_ID }) },
    );
    const text = await response.text();
    const receipt = auditReceiptSchema.parse(JSON.parse(text));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-spendforge-evidence-mode")).toBe(
      "live-sandbox",
    );
    expect(response.headers.get("x-spendforge-evidence-source")).toBe(
      "verified-redacted-capture",
    );
    expect(receipt).toMatchObject({
      receiptId: RAIN_CARD_AUDIT_RECEIPT_ID,
      modes: ["live-sandbox"],
      providers: ["rain"],
      truthBoundary: "sandbox-authoritative",
      synthetic: false,
      disclosureCode: "AUTHORITATIVE_READBACK_ATTACHED",
      summary: {
        operationCount: 1,
        mutationCount: 1,
        authoritativeTerminalCount: 1,
      },
    });
    expect(text).toContain("card:4432...fe71");
    expect(text).toContain("VERIFIED_REDACTED_CAPTURE");
    expect(text).toContain("CARD_TYPE_VIRTUAL");
    expect(text).toContain("CARD_STATUS_ACTIVE");
    expect(text).toContain("CAP_REQUEST_ONLY");
    expect(text).not.toContain("CAP_MATCH");
    expect(text).not.toMatch(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    );
    expect(text).not.toMatch(/encryptedPan|encryptedCvc|sessionid/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns an auditable fixture decision without claiming an OpenAI call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET(
      new Request(
        `https://spendforge.example/api/audit/receipts/${ATLAS_AGENT_DECISION_RECEIPT_ID}`,
      ),
      {
        params: Promise.resolve({
          receiptId: ATLAS_AGENT_DECISION_RECEIPT_ID,
        }),
      },
    );
    const receipt = atlasDecisionReceiptSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-spendforge-evidence-mode")).toBe("fixture");
    expect(response.headers.get("x-spendforge-evidence-source")).toBe(
      "deterministic-fixture-proposal",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="spendforge-atlas-agent-decision-fixture-v1.json"',
    );
    expect(receipt).toMatchObject({
      truthBoundary: "fixture-only",
      synthetic: true,
      disclosureCode: "FIXTURE_DECISION_NO_OPENAI_API_CALL",
      chainOfThoughtStored: false,
      decision: {
        executionMode: "fixture",
        evidenceMode: "fixture",
        providerResponseReference: null,
        policyVerification: {
          finalAction: "APPROVE",
          verifiedMaximumAuthorizedCents: 12,
          eligibleForExecution: true,
        },
      },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns only a stable error code for an unknown receipt", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET(
      new Request("https://spendforge.example/api/audit/receipts/unknown"),
      { params: Promise.resolve({ receiptId: "unknown" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "AUDIT_RECEIPT_NOT_FOUND" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("serializes no raw provider bodies, secret fields, or unmasked refs", async () => {
    const response = await GET(
      new Request(
        `https://spendforge.example/api/audit/receipts/${SYNTHETIC_AUDIT_RECEIPT_ID}`,
      ),
      { params: Promise.resolve({ receiptId: SYNTHETIC_AUDIT_RECEIPT_ID }) },
    );
    const serialized = await response.text();

    expect(serialized).not.toMatch(/authorization|api.?key|private.?key|cvc|cvv/i);
    expect(serialized).not.toMatch(/rawProvider|requestBody|responseBody/i);
    expect(serialized).not.toContain("providerReference");
  });
});
