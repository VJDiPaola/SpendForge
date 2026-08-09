import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createFixtureRainGateway,
  createLiveRainGateway,
  generateRainSessionId,
  normalizeRainProviderState,
  rainAuthorizeInputSchema,
  rainCollateralReceiptSchema,
  UnavailableRainGateway,
} from "@/lib/integrations/rain";

const userId = "11111111-1111-4111-8111-111111111111";
const contractId = "22222222-2222-4222-8222-222222222222";
const cardId = "33333333-3333-4333-8333-333333333333";
const transactionId = "44444444-4444-4444-8444-444444444444";

describe("Rain gateway contract", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts only exact UUIDs, integer-string money, and documented fields", () => {
    const valid = {
      cardId,
      amount: "12",
      currency: "USD" as const,
      merchantName: "Northstar Synthetic",
      merchantCategoryCode: "5734",
      idempotencyKey: "mission:run:rain:1",
    };

    expect(rainAuthorizeInputSchema.parse(valid).amount).toBe("12");
    expect(() =>
      rainAuthorizeInputSchema.parse({ ...valid, amount: 0.12 }),
    ).toThrow();
    expect(() =>
      rainAuthorizeInputSchema.parse({ ...valid, guessedProviderField: true }),
    ).toThrow();
    expect(() =>
      rainAuthorizeInputSchema.parse({ ...valid, merchantCategoryCode: "57" }),
    ).toThrow();
  });

  it("generates an encrypted session id and zeroes the source secret buffer", () => {
    const secret = Buffer.alloc(16, 7);
    const sessionId = generateRainSessionId(() => secret);

    expect(Buffer.from(sessionId, "base64")).toHaveLength(128);
    expect(secret.equals(Buffer.alloc(16))).toBe(true);
  });

  it("rejects a non-allowlisted base URL during live gateway construction", () => {
    const fetchSpy = vi.fn();

    expect(() =>
      createLiveRainGateway(
        {
          RAIN_BASE_URL:
            "https://api-dev.raincards.xyz.evil.example/v1" as never,
          RAIN_API_KEY: "sandbox-secret-never-returned",
          RAIN_USER_ID: userId,
          RAIN_CONTRACT_ID: contractId,
        },
        fetchSpy,
      ),
    ).toThrow(/Rain sandbox base URL is not allowlisted/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps a fixture sequence deterministic and non-authoritative", async () => {
    const gateway = createFixtureRainGateway();
    const authorized = await gateway.authorize({
      cardId,
      amount: "12",
      currency: "USD",
      merchantName: "Northstar Synthetic",
      merchantCategoryCode: "5734",
      idempotencyKey: "mission:run:rain:1",
    });
    const repeated = await gateway.authorize({
      cardId,
      amount: "12",
      currency: "USD",
      merchantName: "Northstar Synthetic",
      merchantCategoryCode: "5734",
      idempotencyKey: "mission:run:rain:1",
    });
    const pending = await gateway.settle({
      transactionReference: authorized.transactionReference,
      idempotencyKey: "mission:run:rain:settle:1",
    });
    const readback = await gateway.readback({
      transactionReference: authorized.transactionReference,
    });

    expect(repeated.transactionReference).toBe(authorized.transactionReference);
    expect(pending.state).toBe("settlement_pending");
    expect(readback.state).toBe("settled");
    expect(readback.evidenceMode).toBe("fixture");
    expect(readback.authoritative).toBe(false);
  });

  it("rejects any fixture receipt that claims authoritative provider truth", () => {
    expect(() =>
      rainCollateralReceiptSchema.parse({
        kind: "collateral",
        provider: "rain",
        providerEnvironment: "rain-sandbox",
        evidenceMode: "fixture",
        authoritative: true,
        providerReference: "fixture-reference",
        providerStateCode: "settled",
        state: "settled",
        observedAt: new Date().toISOString(),
        idempotencyKey: "mission:rain:fixture:1",
        amount: {
          amount: "12",
          decimals: 2,
          asset: "rUSD",
          network: "rain-sandbox",
        },
      }),
    ).toThrow(/Fixture evidence cannot be authoritative/);
  });

  it("maps current provider states and preserves unfamiliar text", () => {
    expect(normalizeRainProviderState("completed")).toEqual({
      state: "settled",
      providerStateCode: "completed",
    });
    expect(normalizeRainProviderState("new_provider_state")).toEqual({
      state: "unknown",
      providerStateCode: "new_provider_state",
    });
  });

  it("keeps replay live operations unavailable", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const gateway = new UnavailableRainGateway();

    await expect(
      gateway.readback({ transactionReference: transactionId }),
    ).rejects.toMatchObject({ code: "LIVE_PROVIDER_UNAVAILABLE" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
