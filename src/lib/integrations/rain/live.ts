import "server-only";

import { ZodType } from "zod";

import type { ServerEnv } from "@/lib/env";
import { rainSandboxBaseUrlSchema } from "@/lib/integrations/rain/base-url";
import {
  normalizeRainProviderState,
  rainAuthorizeInputSchema,
  rainCardReceiptSchema,
  rainCollateralReceiptSchema,
  rainFundInputSchema,
  rainFundResponseSchema,
  rainReadbackInputSchema,
  rainScopedCardInputSchema,
  rainScopedCardResponseSchema,
  rainSettleInputSchema,
  rainSimulatedTransactionResponseSchema,
  rainSpendReadbackResponseSchema,
  rainTransactionReceiptSchema,
  type RainAuthorizeInput,
  type RainCollateralReceipt,
  type RainFundInput,
  type RainGateway,
  type RainReadbackInput,
  type RainScopedCardInput,
  type RainSettleInput,
  type RainTransactionReceipt,
} from "@/lib/integrations/rain/contracts";
import {
  RainProviderError,
  type RainOperationStage,
} from "@/lib/integrations/rain/errors";
import { generateRainSessionId } from "@/lib/integrations/rain/session";

type FetchImplementation = typeof fetch;

export type LiveRainConfiguration = Pick<
  ServerEnv,
  "RAIN_BASE_URL" | "RAIN_API_KEY" | "RAIN_USER_ID" | "RAIN_CONTRACT_ID"
>;

type RequestOptions<T> = {
  stage: RainOperationStage;
  method: "GET" | "POST";
  path: string;
  schema: ZodType<T>;
  idempotencyKey?: string;
  sessionId?: string;
  body?: unknown;
};

function now(): string {
  return new Date().toISOString();
}

export class LiveRainGateway implements RainGateway {
  private readonly baseUrl: string;

  constructor(
    private readonly configuration: LiveRainConfiguration,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {
    if (
      !configuration.RAIN_API_KEY ||
      !configuration.RAIN_USER_ID ||
      !configuration.RAIN_CONTRACT_ID
    ) {
      throw new RainProviderError(
        "RAIN_CONFIGURATION_MISSING",
        "fund_collateral",
      );
    }
    this.baseUrl = rainSandboxBaseUrlSchema.parse(configuration.RAIN_BASE_URL);
  }

  private async request<T>({
    stage,
    method,
    path,
    schema,
    idempotencyKey,
    sessionId,
    body,
  }: RequestOptions<T>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const headers = new Headers({
      Accept: "application/json",
      "Api-Key": this.configuration.RAIN_API_KEY!,
    });

    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (idempotencyKey) {
      headers.set("Idempotency-Key", idempotencyKey);
    }
    if (sessionId) {
      headers.set("sessionid", sessionId);
    }

    let response: Response;
    try {
      response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      throw new RainProviderError(
        method === "POST"
          ? "RAIN_PROVIDER_AMBIGUOUS_WRITE"
          : "RAIN_PROVIDER_HTTP_ERROR",
        stage,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      // Consume but never expose or log the provider body. It could contain
      // tenant-specific identifiers or echo request data.
      await response.text().catch(() => undefined);
      throw new RainProviderError(
        "RAIN_PROVIDER_HTTP_ERROR",
        stage,
        response.status,
      );
    }

    const payload: unknown = await response.json().catch(() => null);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new RainProviderError("RAIN_PROVIDER_SCHEMA_MISMATCH", stage);
    }
    return parsed.data;
  }

  async fundCollateral(input: RainFundInput): Promise<RainCollateralReceipt> {
    const parsed = rainFundInputSchema.parse(input);
    const response = await this.request({
      stage: "fund_collateral",
      method: "POST",
      path: "/simulate/collateral/fund",
      schema: rainFundResponseSchema,
      idempotencyKey: parsed.idempotencyKey,
      body: {
        contractId: parsed.contractId,
        currency: parsed.currency,
        amount: Number(parsed.amount),
      },
    });

    return rainCollateralReceiptSchema.parse({
      kind: "collateral",
      provider: "rain",
      providerEnvironment: "rain-sandbox",
      evidenceMode: "live",
      // A mutation response can provide correlation evidence, but only a
      // direct GET readback can establish authoritative provider state.
      authoritative: false,
      providerReference: response.transactionId,
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
    const sessionId = generateRainSessionId();
    const response = await this.request({
      stage: "issue_scoped_card",
      method: "POST",
      path: `/issuing/users/${encodeURIComponent(parsed.userId)}/cards/scoped`,
      schema: rainScopedCardResponseSchema,
      idempotencyKey: parsed.idempotencyKey,
      sessionId,
      body: { amountInUSDCents: Number(parsed.amountInUSDCents) },
    });
    const normalized = normalizeRainProviderState(response.status);

    return rainCardReceiptSchema.parse({
      kind: "scoped_card",
      provider: "rain",
      providerEnvironment: "rain-sandbox",
      evidenceMode: "live",
      authoritative: false,
      providerReference: response.id,
      providerStateCode: normalized.providerStateCode,
      state: normalized.state,
      observedAt: now(),
      idempotencyKey: parsed.idempotencyKey,
      cardReference: response.id,
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
    const response = await this.request({
      stage: "authorize",
      method: "POST",
      path: "/simulate/transactions/authorize",
      schema: rainSimulatedTransactionResponseSchema,
      idempotencyKey: parsed.idempotencyKey,
      body: {
        cardId: parsed.cardId,
        amount: Number(parsed.amount),
        currency: parsed.currency,
        merchantName: parsed.merchantName,
        merchantCategoryCode: parsed.merchantCategoryCode,
      },
    });
    const normalized = normalizeRainProviderState(response.status);

    return rainTransactionReceiptSchema.parse({
      kind: "transaction",
      provider: "rain",
      providerEnvironment: "rain-sandbox",
      evidenceMode: "live",
      authoritative: false,
      providerReference: response.transactionId,
      providerStateCode: normalized.providerStateCode,
      state: normalized.state,
      observedAt: now(),
      idempotencyKey: parsed.idempotencyKey,
      transactionReference: response.transactionId,
      cardReference: parsed.cardId,
      amount: {
        amount: parsed.amount,
        decimals: 2,
        asset: "USD",
        network: "rain-sandbox",
      },
      merchantName: parsed.merchantName,
      merchantCategoryCode: parsed.merchantCategoryCode,
    });
  }

  async settle(input: RainSettleInput): Promise<RainTransactionReceipt> {
    const parsed = rainSettleInputSchema.parse(input);
    const response = await this.request({
      stage: "settle",
      method: "POST",
      path: `/simulate/transactions/${encodeURIComponent(parsed.transactionReference)}/settle`,
      schema: rainSimulatedTransactionResponseSchema,
      idempotencyKey: parsed.idempotencyKey,
    });

    return rainTransactionReceiptSchema.parse({
      kind: "transaction",
      provider: "rain",
      providerEnvironment: "rain-sandbox",
      evidenceMode: "live",
      authoritative: false,
      providerReference: response.transactionId,
      providerStateCode: response.status,
      // Settlement response is not the terminal application state. Direct
      // readback must report a completed spend before SpendForge says settled.
      state: "settlement_pending",
      observedAt: now(),
      idempotencyKey: parsed.idempotencyKey,
      transactionReference: response.transactionId,
    });
  }

  async readback(input: RainReadbackInput): Promise<RainTransactionReceipt> {
    const parsed = rainReadbackInputSchema.parse(input);
    const response = await this.request({
      stage: "readback",
      method: "GET",
      path: `/issuing/transactions/${encodeURIComponent(parsed.transactionReference)}`,
      schema: rainSpendReadbackResponseSchema,
    });
    const normalized = normalizeRainProviderState(response.spend.status);

    return rainTransactionReceiptSchema.parse({
      kind: "transaction",
      provider: "rain",
      providerEnvironment: "rain-sandbox",
      evidenceMode: "live",
      authoritative: true,
      providerReference: response.id,
      providerStateCode: normalized.providerStateCode,
      state: normalized.state,
      observedAt: now(),
      transactionReference: response.id,
      cardReference: response.spend.cardId,
      userReference: response.spend.userId,
      amount: {
        amount: String(response.spend.amount),
        decimals: 2,
        asset: "USD",
        network: "rain-sandbox",
      },
      merchantName: response.spend.merchantName,
      merchantCategoryCode: response.spend.merchantCategoryCode,
      authorizedAt: response.spend.authorizedAt,
      ...(response.spend.postedAt ? { postedAt: response.spend.postedAt } : {}),
    });
  }
}

export function createLiveRainGateway(
  configuration: LiveRainConfiguration,
  fetchImplementation: FetchImplementation = fetch,
): RainGateway {
  return new LiveRainGateway(configuration, fetchImplementation);
}
