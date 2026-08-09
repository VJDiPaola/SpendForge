import "server-only";

import { createHash } from "node:crypto";

import { x402Client, x402HTTPClient } from "@x402/core/client";
import {
  HTTPFacilitatorClient,
  type FacilitatorClient,
} from "@x402/core/server";
import type { PaymentRequirements, SettleResponse } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { ClientEvmSigner } from "@x402/evm";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

import type {
  X402AttemptGate,
  X402AttemptState,
} from "@/lib/integrations/x402/attempt-gate";
import {
  x402EvidenceFingerprint,
  x402Fingerprint,
} from "@/lib/integrations/x402/attempt-gate";
import {
  MONAD_TESTNET_NETWORK,
  MONAD_TESTNET_USDC_ADDRESS,
  MONAD_X402_FACILITATOR_URL,
  SPENDFORGE_X402_ATTEMPT_HEADER,
  SPENDFORGE_X402_SCHEME,
  SPENDFORGE_X402_USDC_DECIMALS,
  SPENDFORGE_X402_VERSION,
} from "@/lib/integrations/x402/constants";
import type {
  HexAddress,
  X402Gateway,
  X402PayAndFetchInput,
  X402PurchaseResult,
} from "@/lib/integrations/x402/contracts";
import {
  validateX402PayAndFetchInput,
  x402DeliveryEnvelopeSchema,
  x402SettlementReceiptSchema,
  x402SupportedConfigSchema,
} from "@/lib/integrations/x402/contracts";
import { X402AdapterError } from "@/lib/integrations/x402/errors";
import {
  createProtectedPreviewFetch,
  readMonadX402Environment,
  type MonadX402SafetyConfig,
} from "@/lib/integrations/x402/safety";

const settleResponseSchema = z
  .object({
    success: z.boolean(),
    transaction: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    network: z.literal(MONAD_TESTNET_NETWORK),
    amount: z.string().regex(/^(0|[1-9]\d*)$/).optional(),
    payer: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  })
  .passthrough();

type EvidenceMode = "fixture" | "live";

export type OfficialX402GatewayDependencies = {
  signer: ClientEvmSigner;
  facilitatorClient: FacilitatorClient;
  attemptGate: X402AttemptGate;
  fetchImpl: typeof globalThis.fetch;
  now?: () => Date;
};

export type OfficialX402GatewayOptions = {
  safety: MonadX402SafetyConfig;
  evidenceMode: EvidenceMode;
};

export type CreateOfficialX402GatewayOptions = {
  attemptGate: X402AttemptGate;
  fetchImpl?: typeof globalThis.fetch;
  facilitatorClient?: FacilitatorClient;
  environment?: NodeJS.ProcessEnv;
  now?: () => Date;
};

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function normalizeUrl(value: string): string {
  return new URL(value).toString();
}

function requirementFingerprint(requirement: PaymentRequirements): string {
  return x402EvidenceFingerprint(
    [
      requirement.scheme,
      requirement.network,
      requirement.asset.toLowerCase(),
      requirement.amount,
      requirement.payTo.toLowerCase(),
      requirement.maxTimeoutSeconds.toString(),
    ].join("|"),
  );
}

function isSafeRequirement(
  requirement: PaymentRequirements,
  input: X402PayAndFetchInput<unknown>,
  safety: MonadX402SafetyConfig,
): boolean {
  if (
    requirement.scheme !== SPENDFORGE_X402_SCHEME ||
    requirement.network !== MONAD_TESTNET_NETWORK ||
    !sameAddress(requirement.asset, MONAD_TESTNET_USDC_ADDRESS) ||
    !sameAddress(requirement.payTo, input.expectedSeller) ||
    !sameAddress(requirement.payTo, safety.sellerAddress) ||
    !/^(0|[1-9]\d*)$/.test(requirement.amount) ||
    BigInt(requirement.amount) < BigInt(1) ||
    BigInt(requirement.amount) > BigInt(input.maxAmount.amount) ||
    BigInt(requirement.amount) > BigInt(safety.maxAmountAtomic)
  ) {
    return false;
  }

  return (
    requirement.extra.name === "USDC" && requirement.extra.version === "2"
  );
}

function contentHash(resource: unknown): string {
  const serialized = JSON.stringify(resource) ?? "undefined";
  return `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
}

export class OfficialMonadX402Gateway implements X402Gateway {
  private readonly now: () => Date;

  constructor(
    private readonly options: OfficialX402GatewayOptions,
    private readonly dependencies: OfficialX402GatewayDependencies,
  ) {
    this.now = dependencies.now ?? (() => new Date());

    if (!options.safety.paymentEnabled || !options.safety.previewOnly) {
      throw new X402AdapterError("X402_KILL_SWITCH_CLOSED", "not_started");
    }
    if (
      options.evidenceMode === "live" &&
      dependencies.attemptGate.durability !== "durable"
    ) {
      throw new X402AdapterError(
        "X402_DURABLE_GATE_REQUIRED",
        "not_started",
      );
    }
    if (
      sameAddress(dependencies.signer.address, options.safety.sellerAddress)
    ) {
      throw new X402AdapterError("X402_CONFIGURATION_MISSING", "not_started");
    }
  }

  async getSupported() {
    const supported = await this.dependencies.facilitatorClient.getSupported();
    const kinds = supported.kinds.filter(
      (kind) =>
        kind.x402Version === SPENDFORGE_X402_VERSION &&
        kind.network === MONAD_TESTNET_NETWORK,
    );
    const networks = [...new Set(kinds.map((kind) => kind.network))];
    const schemes = [...new Set(kinds.map((kind) => kind.scheme))];
    const hasEvmSigner = Object.values(supported.signers ?? {})
      .flat()
      .some((address) => /^0x[0-9a-fA-F]{40}$/.test(address));

    if (
      !networks.includes(MONAD_TESTNET_NETWORK) ||
      !schemes.includes(SPENDFORGE_X402_SCHEME) ||
      !hasEvmSigner
    ) {
      throw new X402AdapterError(
        "X402_SUPPORTED_SCHEMA_MISMATCH",
        "failed",
      );
    }

    return x402SupportedConfigSchema.parse({
      provider: "x402",
      evidenceMode: this.options.evidenceMode,
      authoritative: this.options.evidenceMode === "live",
      networks,
      schemes,
    });
  }

  async payAndFetch<T>(
    input: X402PayAndFetchInput<T>,
  ): Promise<X402PurchaseResult<T>> {
    const parsed = validateX402PayAndFetchInput(input);
    this.assertAuthorizedInput(parsed);

    const attemptFingerprint = x402Fingerprint(parsed.idempotencyKey);
    const reservedAt = this.now().toISOString();
    let reserved: boolean;
    try {
      reserved = await this.dependencies.attemptGate.reserve({
        attemptFingerprint,
        endpointFingerprint: x402Fingerprint(normalizeUrl(parsed.url)),
        amountAtomic: parsed.maxAmount.amount,
        asset: "USDC",
        network: MONAD_TESTNET_NETWORK,
        reservedAt,
      });
    } catch {
      throw new X402AdapterError("X402_JOURNAL_UNAVAILABLE", "not_started");
    }

    if (!reserved) {
      throw new X402AdapterError("X402_DUPLICATE_ATTEMPT", "not_started");
    }

    let selectedRequirement: PaymentRequirements | undefined;
    let paymentPayloadCreated = false;
    let finalizationAttempted = false;
    const finalizeOnce = async (
      state: Exclude<X402AttemptState, "reserved">,
      transactionReference?: string,
    ) => {
      if (finalizationAttempted) return;
      finalizationAttempted = true;
      await this.finalizeAttempt(
        attemptFingerprint,
        state,
        transactionReference,
      );
    };

    try {
      const client = new x402Client((version, requirements) => {
        if (version !== SPENDFORGE_X402_VERSION) {
          throw new X402AdapterError(
            "X402_PAYMENT_REQUIREMENT_REJECTED",
            "failed",
          );
        }
        const matches = requirements.filter((requirement) =>
          isSafeRequirement(
            requirement,
            parsed as X402PayAndFetchInput<unknown>,
            this.options.safety,
          ),
        );
        if (matches.length !== 1) {
          throw new X402AdapterError(
            "X402_PAYMENT_REQUIREMENT_REJECTED",
            "failed",
          );
        }
        selectedRequirement = matches[0];
        return matches[0];
      });

      client.register(
        MONAD_TESTNET_NETWORK,
        new ExactEvmScheme(this.dependencies.signer),
      );
      client.onAfterPaymentCreation(async () => {
        paymentPayloadCreated = true;
      });

      const fetchWithPayment = wrapFetchWithPayment(
        this.dependencies.fetchImpl,
        client,
      );
      const response = await fetchWithPayment(parsed.url, {
        method: "GET",
        cache: "no-store",
        headers: {
          [SPENDFORGE_X402_ATTEMPT_HEADER]: parsed.idempotencyKey,
        },
      });
      const result = await new x402HTTPClient(client).processResponse(response);

      if (
        result.paymentStatus !== "settled" ||
        !selectedRequirement
      ) {
        await finalizeOnce(
          result.paymentStatus === "settle_failed" ? "failed" : "unknown",
        );
        throw new X402AdapterError(
          result.paymentStatus === "settle_failed"
            ? "X402_PAYMENT_NOT_SETTLED"
            : "X402_SETTLEMENT_UNKNOWN",
          result.paymentStatus === "settle_failed" ? "failed" : "unknown",
        );
      }

      const settlementHeader = settleResponseSchema.safeParse(result.header);
      if (
        !settlementHeader.success ||
        !settlementHeader.data.success ||
        settlementHeader.data.amount !== selectedRequirement.amount ||
        !settlementHeader.data.payer ||
        !sameAddress(
          settlementHeader.data.payer,
          this.dependencies.signer.address,
        )
      ) {
        await finalizeOnce("unknown");
        throw new X402AdapterError("X402_SETTLEMENT_UNKNOWN", "unknown");
      }

      const settlement = this.toSettlementReceipt(
        parsed,
        selectedRequirement,
        settlementHeader.data as SettleResponse,
        x402EvidenceFingerprint(parsed.idempotencyKey),
      );
      await finalizeOnce(
        "settled",
        settlement.transactionReference,
      );

      const resource = parsed.responseSchema.safeParse(result.body);
      if (!resource.success) {
        return {
          settlement,
          delivery: x402DeliveryEnvelopeSchema.parse({
            state: "failed",
            errorCode: "RESOURCE_SCHEMA_INVALID",
          }),
        };
      }

      const delivery = x402DeliveryEnvelopeSchema.parse({
        state: "delivered",
        contentHash: contentHash(resource.data),
      });
      return {
        settlement,
        delivery: { ...delivery, resource: resource.data },
      };
    } catch (error) {
      if (error instanceof X402AdapterError) {
        if (!finalizationAttempted) {
          await finalizeOnce(
            error.operationState === "failed" ? "failed" : "unknown",
          );
        }
        throw error;
      }
      await finalizeOnce(
        paymentPayloadCreated ? "unknown" : "failed",
      );
      throw new X402AdapterError(
        paymentPayloadCreated
          ? "X402_SETTLEMENT_UNKNOWN"
          : "X402_PAYMENT_REQUIREMENT_REJECTED",
        paymentPayloadCreated ? "unknown" : "failed",
      );
    }
  }

  private assertAuthorizedInput<T>(input: X402PayAndFetchInput<T>): void {
    const safety = this.options.safety;
    if (input.idempotencyKey !== safety.authorizedAttemptId) {
      throw new X402AdapterError(
        "X402_ATTEMPT_NOT_AUTHORIZED",
        "not_started",
      );
    }
    if (normalizeUrl(input.url) !== normalizeUrl(safety.allowedResourceUrl)) {
      throw new X402AdapterError("X402_RESOURCE_NOT_ALLOWED", "not_started");
    }
    if (
      input.maxAmount.asset !== "USDC" ||
      input.maxAmount.decimals !== SPENDFORGE_X402_USDC_DECIMALS ||
      input.maxAmount.network !== MONAD_TESTNET_NETWORK ||
      BigInt(input.maxAmount.amount) < BigInt(1) ||
      BigInt(input.maxAmount.amount) > BigInt(safety.maxAmountAtomic) ||
      !sameAddress(input.expectedSeller, safety.sellerAddress)
    ) {
      throw new X402AdapterError(
        "X402_PAYMENT_REQUIREMENT_REJECTED",
        "not_started",
      );
    }
  }

  private toSettlementReceipt<T>(
    input: X402PayAndFetchInput<T>,
    requirement: PaymentRequirements,
    response: SettleResponse,
    attemptEvidenceFingerprint: string,
  ) {
    return x402SettlementReceiptSchema.parse({
      provider: "x402",
      providerEnvironment: "monad-testnet",
      evidenceMode: this.options.evidenceMode,
      authoritative: false,
      state: "settled",
      providerStateCode:
        this.options.evidenceMode === "live"
          ? "facilitator_settled_chain_readback_required"
          : "fixture_facilitator_settled",
      transactionReference: response.transaction,
      sellerAddress: requirement.payTo as HexAddress,
      amount: {
        amount: response.amount ?? requirement.amount,
        decimals: SPENDFORGE_X402_USDC_DECIMALS,
        asset: "USDC",
        network: MONAD_TESTNET_NETWORK,
      },
      observedAt: this.now().toISOString(),
      idempotencyKey: input.idempotencyKey,
      scheme: SPENDFORGE_X402_SCHEME,
      network: MONAD_TESTNET_NETWORK,
      attemptFingerprint: attemptEvidenceFingerprint,
      paymentRequirementFingerprint: requirementFingerprint(requirement),
    });
  }

  private async finalizeAttempt(
    attemptFingerprint: string,
    state: Exclude<X402AttemptState, "reserved">,
    transactionReference?: string,
  ): Promise<void> {
    try {
      await this.dependencies.attemptGate.finalize({
        attemptFingerprint,
        state,
        finalizedAt: this.now().toISOString(),
        transactionReference,
      });
    } catch {
      throw new X402AdapterError("X402_JOURNAL_UNAVAILABLE", "unknown");
    }
  }
}

export function createOfficialMonadX402Gateway(
  options: CreateOfficialX402GatewayOptions,
): OfficialMonadX402Gateway {
  const environment = readMonadX402Environment(options.environment);
  const signer = privateKeyToAccount(environment.buyerPrivateKey);

  return new OfficialMonadX402Gateway(
    { safety: environment, evidenceMode: "live" },
    {
      signer,
      attemptGate: options.attemptGate,
      fetchImpl:
        options.fetchImpl ??
        createProtectedPreviewFetch(environment.protectionBypassSecret),
      facilitatorClient:
        options.facilitatorClient ??
        new HTTPFacilitatorClient({
          url: MONAD_X402_FACILITATOR_URL,
          timeoutMs: 10_000,
        }),
      now: options.now,
    },
  );
}
