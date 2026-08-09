import { describe, expect, it } from "vitest";

import {
  assertUiSafePayload,
  captureResponseShape,
  maskProviderReference,
  maskedReferenceSchema,
} from "@/lib/operations";

describe("operation evidence redaction", () => {
  it("turns transient provider IDs into masked display references", () => {
    const raw = "txn_01JZ7K9VDH6BA4F63D41QX9N2A";
    const masked = maskProviderReference("transaction", raw);

    expect(maskedReferenceSchema.parse(masked)).toBe(masked);
    expect(masked).toMatch(/^transaction:/);
    expect(masked).not.toContain(raw);
    expect(masked.length).toBeLessThan(raw.length);
  });

  it("hash-masks short identifiers instead of exposing them", () => {
    const masked = maskProviderReference("request", "abc");

    expect(masked).toMatch(/^request:sha256:[a-f0-9]{16}$/);
    expect(masked).not.toContain("abc");
  });

  it("captures only field names and JSON types from a provider response", () => {
    const rawProviderResponse = {
      success: true,
      transactionId: "txn_raw_value_must_not_survive",
      details: {
        status: "completed",
        amount: 100_000,
        authorization: "Bearer must-not-survive",
      },
      cardNumber: "4242424242424242",
      cvc: "123",
      rows: [{ id: "provider-id", active: false }],
    };

    const shape = captureResponseShape(rawProviderResponse);
    const serialized = JSON.stringify(shape);

    expect(shape.rootType).toBe("object");
    expect(shape.fields).toContainEqual({ path: "success", type: "boolean" });
    expect(shape.fields).toContainEqual({
      path: "details.status",
      type: "string",
    });
    expect(shape.fields).toContainEqual({ path: "rows[].id", type: "string" });
    expect(shape.omittedSensitiveFieldCount).toBe(3);
    expect(serialized).not.toContain("txn_raw_value_must_not_survive");
    expect(serialized).not.toContain("Bearer must-not-survive");
    expect(serialized).not.toContain("4242424242424242");
    expect(serialized).not.toContain('"cvc"');
  });

  it("rejects secret-shaped values and forbidden raw-body fields", () => {
    expect(() =>
      assertUiSafePayload({ authorization: "redacted-or-not" }),
    ).toThrow(/not allowed/);
    expect(() =>
      assertUiSafePayload({ note: `0x${"a".repeat(64)}` }),
    ).toThrow(/secret or payment-card/);
    expect(() =>
      assertUiSafePayload({ note: "Bearer abc.def.ghi" }),
    ).toThrow(/secret or payment-card/);
    expect(() =>
      assertUiSafePayload({ note: "4242 4242 4242 4242" }),
    ).toThrow(/secret or payment-card/);
    expect(() => assertUiSafePayload({ rawProviderPayload: {} })).toThrow(
      /not allowed/,
    );
  });

  it("accepts bounded UI-safe evidence", () => {
    expect(() =>
      assertUiSafePayload({
        state: "provider-pending",
        reference: "transaction:txn_...x9n2",
        amount: { amount: "100000", decimals: 2, asset: "rUSD" },
      }),
    ).not.toThrow();
  });
});
