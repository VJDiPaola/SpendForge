import "server-only";

import {
  appendDurableOperationState,
  claimDurableOperationAttempt,
  fingerprintSchema,
  maskProviderReference,
  type DurableOperationJournalStore,
  type Fingerprint,
  type OperationEntryDraft,
  type PublicOperationRef,
} from "@/lib/operations";
import {
  decryptRecoveryReference,
  encryptRecoveryReference,
} from "@/lib/operations/recovery";
import { createRuntimeOperationJournalStore } from "@/lib/operations/postgres-store";

import {
  SPENDFORGE_X402_PRICE_ATOMIC,
  SPENDFORGE_X402_RUN_SCOPE,
} from "./constants";

import type {
  X402AttemptFinalization,
  X402AttemptGate,
  X402AttemptReservation,
} from "./attempt-gate";

function identifiers(attemptFingerprint: string): {
  scopeFingerprint: Fingerprint;
  idempotencyFingerprint: Fingerprint;
  operationRef: PublicOperationRef;
} {
  const idempotencyFingerprint = fingerprintSchema.parse(attemptFingerprint);
  return {
    scopeFingerprint: fingerprintSchema.parse(SPENDFORGE_X402_RUN_SCOPE),
    idempotencyFingerprint,
    operationRef: `op_monad_x402_${idempotencyFingerprint.slice(7, 31)}` as PublicOperationRef,
  };
}

function submittedDraft(
  input: X402AttemptReservation,
  operationRef: PublicOperationRef,
  idempotencyFingerprint: Fingerprint,
): OperationEntryDraft {
  return {
    operationRef,
    occurredAt: input.reservedAt,
    provider: "monad_x402",
    mode: "testnet",
    operation: "monad_x402.pay_resource",
    endpoint: "/x402/resource",
    mutation: true,
    state: "submitted",
    truthBoundary: "testnet-unconfirmed",
    idempotencyFingerprint,
    amount: {
      amount: input.amountAtomic,
      decimals: 6,
      asset: input.asset,
      network: input.network,
    },
    authoritativeReadback: {
      state: "not-started",
      providerState: "not-observed",
      matchCodes: [],
    },
    evidenceCodes: [
      "GUARD_ALLOWED",
      "ONE_ATTEMPT_GATE",
      "SUBMISSION_INTENT_RECORDED",
      "DURABLE_MUTATION_CLAIM",
      "X402_RESOURCE_ENDPOINT_HASHED",
    ],
  };
}

/** Durable duplicate gate selected by live Preview x402 construction. */
export class DurableX402AttemptGate implements X402AttemptGate {
  readonly durability = "durable" as const;

  constructor(
    private readonly store: DurableOperationJournalStore,
    private readonly encodedRecoveryKey: string,
  ) {
    if (store.durability !== "durable") {
      throw new Error("Durable x402 operation journal is required");
    }
    if (Buffer.from(encodedRecoveryKey, "base64").length !== 32) {
      throw new Error("Durable x402 recovery encryption is required");
    }
  }

  async reserve(input: X402AttemptReservation): Promise<boolean> {
    const { scopeFingerprint, idempotencyFingerprint, operationRef } = identifiers(
      input.attemptFingerprint,
    );
    const draft = submittedDraft(
      input,
      operationRef,
      idempotencyFingerprint,
    );
    const claim = await claimDurableOperationAttempt({
      store: this.store,
      scopeFingerprint,
      guard: {
        provider: "monad_x402",
        mode: "testnet",
        mutationEnabled: true,
        allowedOperation: "monad_x402.pay_resource",
        maxMutations: 1,
        oneAttemptOnly: true,
        spendCap: draft.amount!,
        cumulativeSpendCap: {
          amount: SPENDFORGE_X402_PRICE_ATOMIC,
          decimals: 6,
          asset: "USDC",
          network: "eip155:10143",
        },
      },
      request: {
        operationRef,
        provider: "monad_x402",
        mode: "testnet",
        operation: "monad_x402.pay_resource",
        attempt: 1,
        idempotencyFingerprint,
        amount: draft.amount!,
      },
      submitted: draft,
    });

    return claim.decision.allowed;
  }

  async finalize(input: X402AttemptFinalization): Promise<void> {
    const { scopeFingerprint, idempotencyFingerprint, operationRef } = identifiers(
      input.attemptFingerprint,
    );
    const current = await this.store.read(scopeFingerprint);
    const submitted = current.find(
      (entry) =>
        entry.operationRef === operationRef && entry.state === "submitted",
    );
    if (!submitted?.amount) {
      throw new Error("Durable x402 reservation is missing");
    }

    const providerCorrelationRef = input.transactionReference
      ? maskProviderReference("transaction", input.transactionReference)
      : undefined;
    const state =
      input.state === "settled"
        ? "provider-confirmed"
        : input.state === "failed"
          ? "provider-failed"
          : "ambiguous";
    const truthBoundary =
      input.state === "settled"
        ? "testnet-authoritative"
        : input.state === "failed"
          ? "provider-failed"
          : "provider-ambiguous";
    const providerState =
      input.state === "settled"
        ? "settlement-pending"
        : input.state === "failed"
          ? "failed"
          : "unknown";

    await appendDurableOperationState({
      store: this.store,
      scopeFingerprint,
      draft: {
        operationRef,
        occurredAt: input.finalizedAt,
        provider: "monad_x402",
        mode: "testnet",
        operation: "monad_x402.pay_resource",
        endpoint: "/x402/resource",
        mutation: true,
        state: input.state === "settled" ? "provider-pending" : state,
        truthBoundary:
          input.state === "settled" ? "testnet-unconfirmed" : truthBoundary,
        idempotencyFingerprint,
        amount: submitted.amount,
        ...(providerCorrelationRef ? { providerCorrelationRef } : {}),
        ...(input.state === "settled" && input.transactionReference
          ? {
              recoveryEnvelope: encryptRecoveryReference({
                kind: "monad_transaction_hash",
                rawReference: input.transactionReference,
                contextFingerprint: idempotencyFingerprint,
                encodedKey: this.encodedRecoveryKey,
              }),
            }
          : {}),
        authoritativeReadback: {
          state:
            input.state === "settled"
              ? "pending"
              : input.state === "failed"
                ? "not-required"
                : "ambiguous",
          observedAt: input.finalizedAt,
          providerState,
          matchCodes: [
            input.state === "settled"
              ? "FACILITATOR_SETTLEMENT_ACCEPTED"
              : input.state === "failed"
                ? "X402_PAYMENT_FAILED"
                : "X402_OUTCOME_UNKNOWN",
          ],
        },
        evidenceCodes: [
          input.state === "settled"
            ? "FACILITATOR_SETTLEMENT_ACCEPTED"
            : input.state === "failed"
              ? "X402_PAYMENT_FAILED"
              : "X402_OUTCOME_UNKNOWN",
          input.state === "settled"
            ? "CHAIN_RECEIPT_REQUIRED"
            : input.state === "unknown"
              ? "NO_AUTO_RETRY"
              : "TERMINAL_RECORDED",
        ],
      },
    });
  }

  async confirmChainReceipt(input: {
    attemptFingerprint: string;
    transactionReference: string;
    confirmedAt: string;
  }): Promise<void> {
    const { scopeFingerprint, idempotencyFingerprint, operationRef } = identifiers(
      input.attemptFingerprint,
    );
    const current = await this.store.read(scopeFingerprint);
    const pending = [...current]
      .reverse()
      .find(
        (entry) =>
          entry.operationRef === operationRef &&
          entry.state === "provider-pending" &&
          entry.recoveryEnvelope?.kind === "monad_transaction_hash",
      );
    if (!pending?.amount || !pending.recoveryEnvelope) {
      throw new Error("Durable x402 facilitator evidence is missing");
    }
    const recovered = decryptRecoveryReference({
      envelope: pending.recoveryEnvelope,
      expectedKind: "monad_transaction_hash",
      expectedContextFingerprint: idempotencyFingerprint,
      encodedKey: this.encodedRecoveryKey,
    });
    if (recovered.toLowerCase() !== input.transactionReference.toLowerCase()) {
      throw new Error("Durable x402 chain receipt does not match");
    }
    await appendDurableOperationState({
      store: this.store,
      scopeFingerprint,
      draft: {
        operationRef,
        occurredAt: input.confirmedAt,
        provider: "monad_x402",
        mode: "testnet",
        operation: "monad_x402.pay_resource",
        endpoint: "/x402/resource",
        mutation: true,
        state: "provider-confirmed",
        truthBoundary: "testnet-authoritative",
        idempotencyFingerprint,
        amount: pending.amount,
        providerCorrelationRef: maskProviderReference(
          "transaction",
          input.transactionReference,
        ),
        recoveryEnvelope: pending.recoveryEnvelope,
        authoritativeReadback: {
          state: "matched-terminal",
          observedAt: input.confirmedAt,
          providerState: "completed",
          matchCodes: [
            "FACILITATOR_SETTLEMENT_MATCH",
            "CHAIN_RECEIPT_SUCCESS",
            "TRANSFER_LOG_BUYER_MATCH",
            "TRANSFER_LOG_SELLER_MATCH",
            "TRANSFER_LOG_AMOUNT_3000_MATCH",
          ],
        },
        evidenceCodes: [
          "MONAD_TESTNET_PAYMENT_CONFIRMED",
          "AUTHORITATIVE_CHAIN_RECEIPT",
          "NO_REAL_FUNDS_CLAIM",
        ],
      },
    });
  }
}

export function createRuntimeX402AttemptGate(
  source: Record<string, string | undefined> = process.env,
): DurableX402AttemptGate {
  return new DurableX402AttemptGate(
    createRuntimeOperationJournalStore(source),
    source.RECOVERY_ENCRYPTION_KEY ?? "",
  );
}
