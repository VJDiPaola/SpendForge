import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import {
  FixtureX402Gateway,
  UnavailableX402Gateway,
  x402SettlementReceiptSchema,
} from "@/experimental/x402";

const sellerAddress = `0x${"2".repeat(40)}` as const;
const price = {
  amount: "3000",
  decimals: 6,
  asset: "USDC",
  network: "eip155:10143",
} as const;
const resourceSchema = z
  .object({
    id: z.literal("pulse-component-v1"),
    manifestVersion: z.literal(1),
  })
  .strict();

describe("x402 gateway contract", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns fixture settlement and delivery as distinct evidence", async () => {
    const gateway = new FixtureX402Gateway({
      sellerAddress,
      price,
      resource: { id: "pulse-component-v1", manifestVersion: 1 },
    });

    const result = await gateway.payAndFetch({
      url: "https://supplier.invalid/api/resources/pulse",
      expectedSeller: sellerAddress,
      maxAmount: price,
      idempotencyKey: "mission:run:x402:1",
      responseSchema: resourceSchema,
    });

    expect(result.settlement).toMatchObject({
      state: "settled",
      evidenceMode: "fixture",
      authoritative: false,
    });
    expect(result.delivery).toMatchObject({
      state: "delivered",
      resource: { id: "pulse-component-v1", manifestVersion: 1 },
    });
    expect(result.delivery.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("preserves settlement when the paid resource fails validation", async () => {
    const gateway = new FixtureX402Gateway({
      sellerAddress,
      price,
      resource: { id: "untrusted-resource", script: "steal-env.js" },
    });

    const result = await gateway.payAndFetch({
      url: "https://supplier.invalid/api/resources/pulse",
      expectedSeller: sellerAddress,
      maxAmount: price,
      idempotencyKey: "mission:run:x402:invalid-resource",
      responseSchema: resourceSchema,
    });

    expect(result.settlement.state).toBe("settled");
    expect(result.delivery).toEqual({
      state: "failed",
      errorCode: "RESOURCE_SCHEMA_INVALID",
    });
  });

  it("does not create a settled result for seller or amount mismatches", async () => {
    const gateway = new FixtureX402Gateway({
      sellerAddress,
      price,
      resource: { id: "pulse-component-v1", manifestVersion: 1 },
    });

    const sellerMismatch = await gateway.payAndFetch({
      url: "https://supplier.invalid/api/resources/pulse",
      expectedSeller: `0x${"3".repeat(40)}`,
      maxAmount: price,
      idempotencyKey: "mission:run:x402:seller-mismatch",
      responseSchema: resourceSchema,
    });
    const amountMismatch = await gateway.payAndFetch({
      url: "https://supplier.invalid/api/resources/pulse",
      expectedSeller: sellerAddress,
      maxAmount: { ...price, amount: "2999" },
      idempotencyKey: "mission:run:x402:amount-mismatch",
      responseSchema: resourceSchema,
    });

    expect(sellerMismatch).toMatchObject({
      settlement: { state: "failed" },
      delivery: { state: "failed", errorCode: "SELLER_MISMATCH" },
    });
    expect(amountMismatch).toMatchObject({
      settlement: { state: "failed" },
      delivery: { state: "failed", errorCode: "AMOUNT_EXCEEDS_MAX" },
    });
  });

  it("rejects a fixture receipt that claims authoritative settlement", () => {
    expect(() =>
      x402SettlementReceiptSchema.parse({
        provider: "x402",
        providerEnvironment: "monad-testnet",
        evidenceMode: "fixture",
        authoritative: true,
        state: "settled",
        providerStateCode: "fixture_settled",
        transactionReference: "fixture-reference",
        sellerAddress,
        amount: price,
        observedAt: new Date().toISOString(),
        idempotencyKey: "mission:run:x402:authoritative",
      }),
    ).toThrow(/Fixture settlement cannot be authoritative/);
  });

  it("keeps live package operations unavailable and makes no HTTP call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const gateway = new UnavailableX402Gateway();

    await expect(gateway.getSupported()).rejects.toMatchObject({
      code: "X402_CONFIGURATION_MISSING",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
