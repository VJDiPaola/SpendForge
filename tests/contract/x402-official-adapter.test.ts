import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { x402Client, x402HTTPClient } from "@x402/core/client";
import {
  type FacilitatorClient,
  x402ResourceServer,
} from "@x402/core/server";
import {
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type {
  PaymentRequired,
  SettleResponse,
  SupportedResponse,
} from "@x402/core/types";
import { ExactEvmScheme as ExactEvmClientScheme } from "@x402/evm/exact/client";
import { ExactEvmScheme as ExactEvmServerScheme } from "@x402/evm/exact/server";
import type { ClientEvmSigner } from "@x402/evm";
import { wrapFetchWithPayment } from "@x402/fetch";
import { NextRequest, NextResponse } from "next/server";

import {
  MemoryX402AttemptGate,
  MONAD_TESTNET_NETWORK,
  MONAD_TESTNET_USDC_ADDRESS,
  MonadX402SellerAdapter,
  OfficialMonadX402Gateway,
  SPENDFORGE_X402_ATTEMPT_HEADER,
  SPENDFORGE_X402_PRICE_ATOMIC,
  X402_PACKAGE_VERSIONS,
  createProtectedPreviewFetch,
  x402Fingerprint,
  type MonadX402SafetyConfig,
} from "@/lib/integrations/x402";

const buyerAddress = `0x${"1".repeat(40)}` as const;
const sellerAddress = `0x${"2".repeat(40)}` as const;
const transactionReference = `0x${"a".repeat(64)}`;
const resourceUrl = "https://supplier.invalid/api/resources/pulse";
const attemptId = "mission:atlas:run:monad-x402:attempt-1";
const price = {
  amount: SPENDFORGE_X402_PRICE_ATOMIC,
  decimals: 6,
  asset: "USDC",
  network: MONAD_TESTNET_NETWORK,
} as const;

const resourceSchema = z
  .object({
    id: z.literal("pulse-component-v1"),
    manifestVersion: z.literal(1),
  })
  .strict();

const safety: MonadX402SafetyConfig = {
  previewOnly: true,
  liveMode: true,
  paymentEnabled: true,
  sellerEnabled: true,
  durableJournalConfigured: true,
  recoveryEncryptionConfigured: true,
  allowedResourceUrl: resourceUrl,
  sellerAddress,
  authorizedAttemptId: attemptId,
  maxAmountAtomic: SPENDFORGE_X402_PRICE_ATOMIC,
  network: MONAD_TESTNET_NETWORK,
};

const supportedFixture: SupportedResponse = {
  kinds: [
    {
      x402Version: 2,
      scheme: "exact",
      network: MONAD_TESTNET_NETWORK,
      extra: {},
    },
  ],
  extensions: [],
  signers: { [MONAD_TESTNET_NETWORK]: [sellerAddress] },
};

function createFacilitatorClient(): FacilitatorClient {
  return {
    getSupported: vi.fn().mockResolvedValue(supportedFixture),
    verify: vi.fn().mockRejectedValue(new Error("not called")),
    settle: vi.fn().mockRejectedValue(new Error("not called")),
  };
}

function createSigner(): ClientEvmSigner {
  return {
    address: buyerAddress,
    signTypedData: vi
      .fn()
      .mockResolvedValue(`0x${"1".repeat(130)}` as `0x${string}`),
  };
}

function paymentRequired(overrides: Partial<PaymentRequired> = {}): PaymentRequired {
  return {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description: "Synthetic Pulse component",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: MONAD_TESTNET_NETWORK,
        asset: MONAD_TESTNET_USDC_ADDRESS,
        amount: SPENDFORGE_X402_PRICE_ATOMIC,
        payTo: sellerAddress,
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2" },
      },
    ],
    ...overrides,
  };
}

function settledResponse(): SettleResponse {
  return {
    success: true,
    transaction: transactionReference,
    network: MONAD_TESTNET_NETWORK,
    amount: SPENDFORGE_X402_PRICE_ATOMIC,
    payer: buyerAddress,
  };
}

function paidFetch(resource: unknown = {
  id: "pulse-component-v1",
  manifestVersion: 1,
}) {
  const calls: Array<{ headers: Headers }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(
      input instanceof Request ? input.headers : init?.headers,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    calls.push({ headers });
    if (calls.length === 1) {
      return new Response(JSON.stringify({}), {
        status: 402,
        headers: {
          "content-type": "application/json",
          "payment-required": encodePaymentRequiredHeader(paymentRequired()),
        },
      });
    }
    return new Response(JSON.stringify(resource), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "payment-response": encodePaymentResponseHeader(settledResponse()),
      },
    });
  });
  return { fetchImpl: fetchImpl as typeof globalThis.fetch, calls };
}

function createGateway(
  fetchImpl: typeof globalThis.fetch,
  gate = new MemoryX402AttemptGate(),
) {
  return {
    gate,
    gateway: new OfficialMonadX402Gateway(
      { safety, evidenceMode: "fixture" },
      {
        signer: createSigner(),
        facilitatorClient: createFacilitatorClient(),
        attemptGate: gate,
        fetchImpl,
        now: () => new Date("2026-08-08T18:00:00.000Z"),
      },
    ),
  };
}

describe("official Monad x402 v2 adapter contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the installed official package exports pinned by the preflight", () => {
    expect(X402_PACKAGE_VERSIONS).toEqual({
      core: "2.21.0",
      evm: "2.21.0",
      fetch: "2.21.0",
      next: "2.21.0",
    });
    expect(x402Client).toBeTypeOf("function");
    expect(x402HTTPClient).toBeTypeOf("function");
    expect(x402ResourceServer).toBeTypeOf("function");
    expect(ExactEvmClientScheme).toBeTypeOf("function");
    expect(ExactEvmServerScheme).toBeTypeOf("function");
    expect(wrapFetchWithPayment).toBeTypeOf("function");
  });

  it("forwards Vercel Preview protection only inside the server fetch boundary", async () => {
    const bypass = "fixture-preview-bypass-never-serialized";
    const fetchImpl = vi.fn(async (_input, init) => {
      expect(new Headers(init?.headers).get("x-vercel-protection-bypass")).toBe(
        bypass,
      );
      return Response.json({ ok: true });
    }) as unknown as typeof globalThis.fetch;
    const protectedFetch = createProtectedPreviewFetch(bypass, fetchImpl);
    const response = await protectedFetch(resourceUrl, {
      headers: { accept: "application/json" },
    });
    expect(await response.json()).toEqual({ ok: true });
    expect(JSON.stringify(response)).not.toContain(bypass);
  });

  it("maps the docs-shaped supported fixture without making it authoritative", async () => {
    const transport = paidFetch();
    const { gateway } = createGateway(transport.fetchImpl);

    await expect(gateway.getSupported()).resolves.toEqual({
      provider: "x402",
      evidenceMode: "fixture",
      authoritative: false,
      networks: [MONAD_TESTNET_NETWORK],
      schemes: ["exact"],
    });
    expect(transport.calls).toHaveLength(0);
  });

  it("requires a durable duplicate gate before any live-mode construction", () => {
    expect(
      () =>
        new OfficialMonadX402Gateway(
          { safety, evidenceMode: "live" },
          {
            signer: createSigner(),
            facilitatorClient: createFacilitatorClient(),
            attemptGate: new MemoryX402AttemptGate(),
            fetchImpl: paidFetch().fetchImpl,
          },
        ),
    ).toThrowError(
      expect.objectContaining({
        code: "X402_DURABLE_GATE_REQUIRED",
        operationState: "not_started",
      }),
    );
  });

  it("fails before provider fetch when the durable journal cannot reserve", async () => {
    const fetchImpl = vi.fn() as unknown as typeof globalThis.fetch;
    const gateway = new OfficialMonadX402Gateway(
      { safety, evidenceMode: "fixture" },
      {
        signer: createSigner(),
        facilitatorClient: createFacilitatorClient(),
        attemptGate: {
          durability: "durable",
          reserve: vi.fn().mockRejectedValue(new Error("database unavailable")),
          finalize: vi.fn(),
        },
        fetchImpl,
      },
    );

    await expect(
      gateway.payAndFetch({
        url: resourceUrl,
        expectedSeller: sellerAddress,
        maxAmount: price,
        idempotencyKey: attemptId,
        responseSchema: resourceSchema,
      }),
    ).rejects.toMatchObject({
      code: "X402_JOURNAL_UNAVAILABLE",
      operationState: "not_started",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not overwrite a settled response when terminal journal persistence fails", async () => {
    const transport = paidFetch();
    const finalize = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const gateway = new OfficialMonadX402Gateway(
      { safety, evidenceMode: "fixture" },
      {
        signer: createSigner(),
        facilitatorClient: createFacilitatorClient(),
        attemptGate: {
          durability: "durable",
          reserve: vi.fn().mockResolvedValue(true),
          finalize,
        },
        fetchImpl: transport.fetchImpl,
      },
    );

    await expect(
      gateway.payAndFetch({
        url: resourceUrl,
        expectedSeller: sellerAddress,
        maxAmount: price,
        idempotencyKey: attemptId,
        responseSchema: resourceSchema,
      }),
    ).rejects.toMatchObject({
      code: "X402_JOURNAL_UNAVAILABLE",
      operationState: "unknown",
    });
    expect(transport.calls).toHaveLength(2);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({ state: "settled" }),
    );
  });

  it("executes the official 402 retry path against fake responses and stays fixture-only", async () => {
    const transport = paidFetch();
    const { gateway, gate } = createGateway(transport.fetchImpl);

    const result = await gateway.payAndFetch({
      url: resourceUrl,
      expectedSeller: sellerAddress,
      maxAmount: price,
      idempotencyKey: attemptId,
      responseSchema: resourceSchema,
    });

    expect(transport.calls).toHaveLength(2);
    expect(
      transport.calls[0].headers.get(SPENDFORGE_X402_ATTEMPT_HEADER),
    ).toBe(attemptId);
    expect(transport.calls[0].headers.has("payment-signature")).toBe(false);
    expect(transport.calls[1].headers.has("payment-signature")).toBe(true);
    expect(result).toMatchObject({
      settlement: {
        state: "settled",
        evidenceMode: "fixture",
        authoritative: false,
        transactionReference,
        amount: price,
        scheme: "exact",
        network: MONAD_TESTNET_NETWORK,
      },
      delivery: {
        state: "delivered",
        resource: { id: "pulse-component-v1", manifestVersion: 1 },
      },
    });
    expect(result.delivery.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(gate.read(x402Fingerprint(attemptId))).toMatchObject({
      state: "settled",
      amountAtomic: SPENDFORGE_X402_PRICE_ATOMIC,
    });
  });

  it("preserves settlement truth when the delivered resource is invalid", async () => {
    const transport = paidFetch({
      id: "untrusted-component",
      script: "read-env.js",
    });
    const { gateway } = createGateway(transport.fetchImpl);

    const result = await gateway.payAndFetch({
      url: resourceUrl,
      expectedSeller: sellerAddress,
      maxAmount: price,
      idempotencyKey: attemptId,
      responseSchema: resourceSchema,
    });

    expect(result.settlement).toMatchObject({ state: "settled" });
    expect(result.delivery).toEqual({
      state: "failed",
      errorCode: "RESOURCE_SCHEMA_INVALID",
    });
  });

  it("rejects an over-cap requirement before signing or retrying", async () => {
    const signer = createSigner();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({}), {
        status: 402,
        headers: {
          "payment-required": encodePaymentRequiredHeader(
            paymentRequired({
              accepts: [
                {
                  ...paymentRequired().accepts[0],
                  amount: "3001",
                },
              ],
            }),
          ),
        },
      }),
    ) as unknown as typeof globalThis.fetch;
    const gate = new MemoryX402AttemptGate();
    const gateway = new OfficialMonadX402Gateway(
      { safety, evidenceMode: "fixture" },
      {
        signer,
        facilitatorClient: createFacilitatorClient(),
        attemptGate: gate,
        fetchImpl,
      },
    );

    await expect(
      gateway.payAndFetch({
        url: resourceUrl,
        expectedSeller: sellerAddress,
        maxAmount: price,
        idempotencyKey: attemptId,
        responseSchema: resourceSchema,
      }),
    ).rejects.toMatchObject({
      code: "X402_PAYMENT_REQUIREMENT_REJECTED",
      operationState: "failed",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(gate.read(x402Fingerprint(attemptId))).toMatchObject({
      state: "failed",
    });
  });

  it("blocks duplicate and unauthorized attempts before provider work", async () => {
    const transport = paidFetch();
    const { gateway } = createGateway(transport.fetchImpl);
    const input = {
      url: resourceUrl,
      expectedSeller: sellerAddress,
      maxAmount: price,
      idempotencyKey: attemptId,
      responseSchema: resourceSchema,
    } as const;

    await gateway.payAndFetch(input);
    await expect(gateway.payAndFetch(input)).rejects.toMatchObject({
      code: "X402_DUPLICATE_ATTEMPT",
      operationState: "not_started",
    });
    await expect(
      gateway.payAndFetch({ ...input, idempotencyKey: `${attemptId}-different` }),
    ).rejects.toMatchObject({
      code: "X402_ATTEMPT_NOT_AUTHORIZED",
      operationState: "not_started",
    });
    expect(transport.calls).toHaveLength(2);
  });

  it("marks a transport failure after signing as unknown and never retries", async () => {
    let count = 0;
    const fetchImpl = vi.fn(async () => {
      count += 1;
      if (count === 1) {
        return new Response(JSON.stringify({}), {
          status: 402,
          headers: {
            "payment-required": encodePaymentRequiredHeader(paymentRequired()),
          },
        });
      }
      throw new Error("synthetic transport loss");
    }) as unknown as typeof globalThis.fetch;
    const { gateway, gate } = createGateway(fetchImpl);

    await expect(
      gateway.payAndFetch({
        url: resourceUrl,
        expectedSeller: sellerAddress,
        maxAmount: price,
        idempotencyKey: attemptId,
        responseSchema: resourceSchema,
      }),
    ).rejects.toMatchObject({
      code: "X402_SETTLEMENT_UNKNOWN",
      operationState: "unknown",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(gate.read(x402Fingerprint(attemptId))).toMatchObject({
      state: "unknown",
    });
  });

  it("builds a gated seller route with atomic pricing and no provider call", async () => {
    const facilitator = createFacilitatorClient();
    const seller = new MonadX402SellerAdapter({ safety, facilitatorClient: facilitator });
    const config = seller.getRouteConfig();
    const handler = seller.protect(async () =>
      NextResponse.json({ id: "pulse-component-v1", manifestVersion: 1 }),
    );

    expect(seller.hasExactMonadScheme()).toBe(true);
    expect(config).toMatchObject({
      accepts: {
        scheme: "exact",
        network: MONAD_TESTNET_NETWORK,
        payTo: sellerAddress,
        price: {
          amount: SPENDFORGE_X402_PRICE_ATOMIC,
          asset: MONAD_TESTNET_USDC_ADDRESS,
        },
      },
      resource: resourceUrl,
    });

    const response = await handler(new NextRequest(resourceUrl));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: "X402_ATTEMPT_NOT_AUTHORIZED",
    });
    expect(facilitator.getSupported).not.toHaveBeenCalled();
    expect(facilitator.verify).not.toHaveBeenCalled();
    expect(facilitator.settle).not.toHaveBeenCalled();

    const paymentRequiredResponse = await handler(
      new NextRequest(resourceUrl, {
        headers: {
          accept: "application/json",
          [SPENDFORGE_X402_ATTEMPT_HEADER]: attemptId,
        },
      }),
    );
    expect(paymentRequiredResponse.status).toBe(402);
    expect(paymentRequiredResponse.headers.has("payment-required")).toBe(true);
    expect(facilitator.getSupported).toHaveBeenCalledTimes(1);
    expect(facilitator.verify).not.toHaveBeenCalled();
    expect(facilitator.settle).not.toHaveBeenCalled();
  });
});
