import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildSyntheticAuditReceipt } from "@/lib/operations";
import {
  canonicalReceiptPayload,
  DEMO_RECEIPT_SIGNING_KEY,
  DEMO_RECEIPT_SIGNING_KEY_ID,
  resolveReceiptSigningKey,
  signAuditReceipt,
  verifyAuditReceipt,
} from "@/lib/operations/receipt-signature";
import type { AuditReceipt } from "@/lib/operations";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("audit receipt signatures", () => {
  it("verifies a receipt it just signed", () => {
    const signed = signAuditReceipt(buildSyntheticAuditReceipt());

    expect(signed.signature).toBeDefined();
    expect(signed.signature?.algorithm).toBe("HMAC-SHA256");
    expect(signed.signature?.keyId).toBe(DEMO_RECEIPT_SIGNING_KEY_ID);

    const result = verifyAuditReceipt(signed);
    expect(result.valid).toBe(true);
    expect(result.valid && result.usedPublishedDemoKey).toBe(true);
  });

  it("rejects a receipt whose contents were edited after signing", () => {
    const signed = signAuditReceipt(buildSyntheticAuditReceipt());
    const tampered = clone(signed);
    tampered.summary.mutationCount += 1;

    const result = verifyAuditReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.reason).toContain(
      "does not match the receipt contents",
    );
  });

  it("rejects a receipt whose signature value was swapped", () => {
    const signed = signAuditReceipt(buildSyntheticAuditReceipt());
    const tampered = clone(signed);
    tampered.signature = {
      ...tampered.signature!,
      value: `hmac-sha256:${"0".repeat(64)}`,
    };

    expect(verifyAuditReceipt(tampered).valid).toBe(false);
  });

  it("reports an unsigned receipt rather than passing it", () => {
    const result = verifyAuditReceipt(buildSyntheticAuditReceipt());
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.reason).toContain("no signature");
  });

  it("refuses to verify across mismatched key ids", () => {
    const signed = signAuditReceipt(buildSyntheticAuditReceipt());
    const otherKey = resolveReceiptSigningKey({
      RECEIPT_SIGNING_KEY: DEMO_RECEIPT_SIGNING_KEY,
      RECEIPT_SIGNING_KEY_ID: "deployment-v1",
    });

    const result = verifyAuditReceipt(signed, otherKey);
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.reason).toContain("deployment-v1");
  });

  it("signs identically regardless of field insertion order", () => {
    const receipt = buildSyntheticAuditReceipt();
    const reordered = Object.fromEntries(
      Object.entries(clone(receipt)).reverse(),
    ) as unknown as AuditReceipt;

    expect(canonicalReceiptPayload(reordered)).toBe(
      canonicalReceiptPayload(receipt),
    );
    expect(signAuditReceipt(reordered).signature?.value).toBe(
      signAuditReceipt(receipt).signature?.value,
    );
  });

  it("re-signing is stable, so a served receipt does not churn", () => {
    const receipt = buildSyntheticAuditReceipt();
    expect(signAuditReceipt(receipt).signature?.value).toBe(
      signAuditReceipt(receipt).signature?.value,
    );
  });

  it("a deployment key produces a different signature than the demo key", () => {
    const receipt = buildSyntheticAuditReceipt();
    const deploymentKey = resolveReceiptSigningKey({
      RECEIPT_SIGNING_KEY: Buffer.alloc(32, 7).toString("base64"),
    });

    const demoSigned = signAuditReceipt(receipt);
    const deploymentSigned = signAuditReceipt(receipt, deploymentKey);

    expect(deploymentSigned.signature?.keyId).toBe("deployment-v1");
    expect(deploymentSigned.signature?.value).not.toBe(
      demoSigned.signature?.value,
    );
    expect(verifyAuditReceipt(deploymentSigned, deploymentKey).valid).toBe(true);
  });

  it("rejects key material that is too short to be a signing key", () => {
    expect(() =>
      resolveReceiptSigningKey({
        RECEIPT_SIGNING_KEY: Buffer.alloc(16, 1).toString("base64"),
      }),
    ).toThrow(/at least 32 bytes/u);
  });
});
