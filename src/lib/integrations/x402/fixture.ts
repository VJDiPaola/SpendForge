import "server-only";

import { createHash } from "node:crypto";

import type { ProviderMoney } from "@/lib/integrations/types";
import type {
  HexAddress,
  X402Gateway,
  X402PayAndFetchInput,
  X402PurchaseResult,
  X402SettlementReceipt,
} from "@/lib/integrations/x402/contracts";
import {
  hexAddressSchema,
  validateX402PayAndFetchInput,
  x402DeliveryEnvelopeSchema,
  x402SettlementReceiptSchema,
  x402SupportedConfigSchema,
} from "@/lib/integrations/x402/contracts";
import { providerMoneySchema } from "@/lib/integrations/types";

export type FixtureX402Options = {
  sellerAddress: HexAddress;
  price: ProviderMoney;
  resource: unknown;
};

function referenceFor(key: string): string {
  return `fixture_x402_${createHash("sha256")
    .update(key)
    .digest("hex")
    .slice(0, 16)}`;
}
function contentHash(resource: unknown): string {
  const serialized = JSON.stringify(resource) ?? "undefined";
  return `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
}

function sameDenomination(left: ProviderMoney, right: ProviderMoney): boolean {
  return (
    left.asset === right.asset &&
    left.decimals === right.decimals &&
    left.network === right.network
  );
}

export class FixtureX402Gateway implements X402Gateway {
  private readonly options: FixtureX402Options;

  constructor(options: FixtureX402Options) {
    this.options = {
      sellerAddress: hexAddressSchema.parse(options.sellerAddress) as HexAddress,
      price: providerMoneySchema.parse(options.price),
      resource: options.resource,
    };
  }

  async getSupported() {
    return x402SupportedConfigSchema.parse({
      provider: "x402",
      evidenceMode: "fixture",
      authoritative: false,
      networks: ["eip155:10143"],
      schemes: ["fixture"],
    });
  }

  async payAndFetch<T>(
    input: X402PayAndFetchInput<T>,
  ): Promise<X402PurchaseResult<T>> {
    const parsed = validateX402PayAndFetchInput(input);
    const commonReceipt = {
      provider: "x402" as const,
      providerEnvironment: "monad-testnet" as const,
      evidenceMode: "fixture" as const,
      authoritative: false,
      sellerAddress: this.options.sellerAddress,
      amount: this.options.price,
      observedAt: new Date().toISOString(),
      idempotencyKey: parsed.idempotencyKey,
    };

    if (
      parsed.expectedSeller.toLowerCase() !==
      this.options.sellerAddress.toLowerCase()
    ) {
      return this.failedResult(commonReceipt, "SELLER_MISMATCH");
    }

    if (!sameDenomination(this.options.price, parsed.maxAmount)) {
      return this.failedResult(commonReceipt, "DENOMINATION_MISMATCH");
    }

    if (BigInt(this.options.price.amount) > BigInt(parsed.maxAmount.amount)) {
      return this.failedResult(commonReceipt, "AMOUNT_EXCEEDS_MAX");
    }

    const settlement = x402SettlementReceiptSchema.parse({
      ...commonReceipt,
      state: "settled",
      providerStateCode: "fixture_settled",
      transactionReference: referenceFor(parsed.idempotencyKey),
    });
    const resourceResult = parsed.responseSchema.safeParse(this.options.resource);

    if (!resourceResult.success) {
      const delivery = x402DeliveryEnvelopeSchema.parse({
        state: "failed",
        errorCode: "RESOURCE_SCHEMA_INVALID",
      });
      return { settlement, delivery };
    }

    const delivery = x402DeliveryEnvelopeSchema.parse({
      state: "delivered",
      contentHash: contentHash(resourceResult.data),
    });
    return {
      settlement,
      delivery: { ...delivery, resource: resourceResult.data },
    };
  }

  private failedResult<T>(
    commonReceipt: Omit<
      X402SettlementReceipt,
      "state" | "providerStateCode" | "transactionReference"
    >,
    errorCode:
      | "SELLER_MISMATCH"
      | "AMOUNT_EXCEEDS_MAX"
      | "DENOMINATION_MISMATCH",
  ): X402PurchaseResult<T> {
    const settlement = x402SettlementReceiptSchema.parse({
      ...commonReceipt,
      state: "failed",
      providerStateCode: `fixture_${errorCode.toLowerCase()}`,
    });
    const delivery = x402DeliveryEnvelopeSchema.parse({
      state: "failed",
      errorCode,
    });
    return { settlement, delivery };
  }
}

export function createFixtureX402Gateway(
  options: FixtureX402Options,
): X402Gateway {
  return new FixtureX402Gateway(options);
}
