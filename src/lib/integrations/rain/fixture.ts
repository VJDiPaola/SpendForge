import "server-only";

import { createHash } from "node:crypto";

import type {
  RainAuthorizeInput,
  RainCollateralReceipt,
  RainFundInput,
  RainGateway,
  RainReadbackInput,
  RainScopedCardInput,
  RainSettleInput,
  RainTransactionReceipt,
} from "@/lib/integrations/rain/contracts";
import {
  rainAuthorizeInputSchema,
  rainCardReceiptSchema,
  rainCollateralReceiptSchema,
  rainFundInputSchema,
  rainReadbackInputSchema,
  rainScopedCardInputSchema,
  rainSettleInputSchema,
  rainTransactionReceiptSchema,
} from "@/lib/integrations/rain/contracts";

function fixtureReference(prefix: string, key: string): string {
  const suffix = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return `${prefix}_${suffix}`;
}
function now(): string {
  return new Date().toISOString();
}

export class FixtureRainGateway implements RainGateway {
  private readonly transactions = new Map<string, RainTransactionReceipt>();

  async fundCollateral(input: RainFundInput): Promise<RainCollateralReceipt> {
    const parsed = rainFundInputSchema.parse(input);

    return rainCollateralReceiptSchema.parse({
      kind: "collateral",
      provider: "rain",
      providerEnvironment: "rain-sandbox",
      evidenceMode: "fixture",
      authoritative: false,
      providerReference: fixtureReference("fixture_rain_fund", parsed.idempotencyKey),
      providerStateCode: "accepted",
      state: "accepted",
      observedAt: now(),
      idempotencyKey: parsed.idempotencyKey,
      amount: {
        amount: parsed.amount,
        decimals: 2,
        asset: "rUSD",
        network: "rain-sandbox",
      },
    });
  }

  async issueScopedCard(input: RainScopedCardInput) {
    const parsed = rainScopedCardInputSchema.parse(input);
    const cardReference = fixtureReference(
      "fixture_rain_card",
      parsed.idempotencyKey,
    );

    return rainCardReceiptSchema.parse({
      kind: "scoped_card",
      provider: "rain",
      providerEnvironment: "rain-sandbox",
      evidenceMode: "fixture",
      authoritative: false,
      providerReference: cardReference,
      providerStateCode: "accepted",
      state: "accepted",
      observedAt: now(),
      idempotencyKey: parsed.idempotencyKey,
      cardReference,
      amountLimit: {
        amount: parsed.amountInUSDCents,
        decimals: 2,
        asset: "USDC",
        network: "rain-sandbox",
      },
    });
  }

  async authorize(input: RainAuthorizeInput): Promise<RainTransactionReceipt> {
    const parsed = rainAuthorizeInputSchema.parse(input);
    const transactionReference = fixtureReference(
      "fixture_rain_tx",
      parsed.idempotencyKey,
    );
    const receipt = rainTransactionReceiptSchema.parse({
      kind: "transaction",
      provider: "rain",
      providerEnvironment: "rain-sandbox",
      evidenceMode: "fixture",
      authoritative: false,
      providerReference: transactionReference,
      providerStateCode: "authorized",
      state: "authorized",
      observedAt: now(),
      idempotencyKey: parsed.idempotencyKey,
      transactionReference,
      amount: {
        amount: parsed.amount,
        decimals: 2,
        asset: parsed.currency,
        network: "rain-sandbox",
      },
      merchantName: parsed.merchantName,
      merchantCategoryCode: parsed.merchantCategoryCode,
    });

    this.transactions.set(transactionReference, receipt);
    return receipt;
  }

  async settle(input: RainSettleInput): Promise<RainTransactionReceipt> {
    const parsed = rainSettleInputSchema.parse(input);
    const prior = this.transactions.get(parsed.transactionReference);
    const receipt = rainTransactionReceiptSchema.parse({
      kind: "transaction",
      provider: "rain",
      providerEnvironment: "rain-sandbox",
      evidenceMode: "fixture",
      authoritative: false,
      providerReference: parsed.transactionReference,
      providerStateCode: "settlement_pending",
      state: "settlement_pending",
      observedAt: now(),
      idempotencyKey: parsed.idempotencyKey,
      transactionReference: parsed.transactionReference,
      ...(prior?.amount ? { amount: prior.amount } : {}),
      ...(prior?.merchantName ? { merchantName: prior.merchantName } : {}),
      ...(prior?.merchantCategoryCode
        ? { merchantCategoryCode: prior.merchantCategoryCode }
        : {}),
    });

    this.transactions.set(parsed.transactionReference, receipt);
    return receipt;
  }

  async readback(input: RainReadbackInput): Promise<RainTransactionReceipt> {
    const parsed = rainReadbackInputSchema.parse(input);
    const prior = this.transactions.get(parsed.transactionReference);

    return rainTransactionReceiptSchema.parse({
      kind: "transaction",
      provider: "rain",
      providerEnvironment: "rain-sandbox",
      evidenceMode: "fixture",
      authoritative: false,
      providerReference: parsed.transactionReference,
      providerStateCode: prior ? "settled" : "unknown",
      state: prior ? "settled" : "unknown",
      observedAt: now(),
      transactionReference: parsed.transactionReference,
      ...(prior?.amount ? { amount: prior.amount } : {}),
      ...(prior?.merchantName ? { merchantName: prior.merchantName } : {}),
      ...(prior?.merchantCategoryCode
        ? { merchantCategoryCode: prior.merchantCategoryCode }
        : {}),
    });
  }
}

export function createFixtureRainGateway(): RainGateway {
  return new FixtureRainGateway();
}
