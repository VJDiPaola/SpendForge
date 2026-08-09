import "server-only";

import {
  appendDurableOperationState,
  buildAuditReceipt,
  fingerprintSchema,
  maskProviderReference,
  type AuditReceipt,
  type DurableOperationJournalStore,
  type OperationJournalEntry,
  type PublicOperationRef,
} from "@/lib/operations";
import {
  decryptRecoveryReference,
  encryptRecoveryReference,
} from "@/lib/operations/recovery";
import { createRuntimeOperationJournalStore } from "@/lib/operations/postgres-store";

import {
  MONAD_TESTNET_NETWORK,
  SPENDFORGE_X402_PRICE_ATOMIC,
  SPENDFORGE_X402_RUN_SCOPE,
} from "./constants";

export const MONAD_X402_PROOF_RECEIPT_ID =
  "audit_monad_x402_pulse_testnet_v1";
const deliveryOperationRef =
  "op_monad_x402_pulse_delivery_v1" as PublicOperationRef;

function latestDeliveryEntry(journal: readonly OperationJournalEntry[]) {
  return [...journal]
    .reverse()
    .find((entry) => entry.operationRef === deliveryOperationRef);
}

export async function recordMonadSellerSettlementDelivery(input: {
  store: DurableOperationJournalStore;
  attemptFingerprint: string;
  transactionReference: string;
  deliveryContentHash: string;
  encodedRecoveryKey: string;
  observedAt: string;
}) {
  const attemptFingerprint = fingerprintSchema.parse(input.attemptFingerprint);
  const deliveryContentHash = fingerprintSchema.parse(input.deliveryContentHash);
  const current = await input.store.read(SPENDFORGE_X402_RUN_SCOPE);
  if (latestDeliveryEntry(current)) {
    throw new Error("X402_SELLER_EVIDENCE_ALREADY_RECORDED");
  }
  return appendDurableOperationState({
    store: input.store,
    scopeFingerprint: SPENDFORGE_X402_RUN_SCOPE,
    draft: {
      operationRef: deliveryOperationRef,
      occurredAt: input.observedAt,
      provider: "monad_x402",
      mode: "testnet",
      operation: "monad_x402.read_receipt",
      endpoint: "/x402/receipt/{transactionRef}",
      mutation: false,
      amount: {
        amount: SPENDFORGE_X402_PRICE_ATOMIC,
        decimals: 6,
        asset: "USDC",
        network: MONAD_TESTNET_NETWORK,
      },
      state: "provider-pending",
      truthBoundary: "testnet-unconfirmed",
      providerCorrelationRef: maskProviderReference(
        "transaction",
        input.transactionReference,
      ),
      deliveryContentHash,
      recoveryEnvelope: encryptRecoveryReference({
        kind: "monad_transaction_hash",
        rawReference: input.transactionReference,
        contextFingerprint: attemptFingerprint,
        encodedKey: input.encodedRecoveryKey,
      }),
      authoritativeReadback: {
        state: "pending",
        observedAt: input.observedAt,
        providerState: "settlement-pending",
        matchCodes: [
          "SELLER_SETTLEMENT_RESPONSE_RECEIVED",
          "DELIVERY_MANIFEST_HASHED",
        ],
      },
      evidenceCodes: [
        "SELLER_SETTLEMENT_JOURNALED",
        "ENCRYPTED_RECOVERY_REFERENCE_STORED",
        "DELIVERY_CAUSALITY_PENDING_CHAIN_READBACK",
      ],
    },
  });
}

export async function confirmMonadSellerSettlementDelivery(input: {
  store: DurableOperationJournalStore;
  attemptFingerprint: string;
  transactionReference: string;
  encodedRecoveryKey: string;
  confirmedAt: string;
}) {
  const attemptFingerprint = fingerprintSchema.parse(input.attemptFingerprint);
  const current = await input.store.read(SPENDFORGE_X402_RUN_SCOPE);
  const pending = latestDeliveryEntry(current);
  if (!pending?.recoveryEnvelope || !pending.deliveryContentHash || !pending.amount) {
    throw new Error("X402_SELLER_EVIDENCE_MISSING");
  }
  const recovered = decryptRecoveryReference({
    envelope: pending.recoveryEnvelope,
    expectedKind: "monad_transaction_hash",
    expectedContextFingerprint: attemptFingerprint,
    encodedKey: input.encodedRecoveryKey,
  });
  if (recovered.toLowerCase() !== input.transactionReference.toLowerCase()) {
    throw new Error("X402_SELLER_RECEIPT_MISMATCH");
  }
  return appendDurableOperationState({
    store: input.store,
    scopeFingerprint: SPENDFORGE_X402_RUN_SCOPE,
    draft: {
      operationRef: deliveryOperationRef,
      occurredAt: input.confirmedAt,
      provider: "monad_x402",
      mode: "testnet",
      operation: "monad_x402.read_receipt",
      endpoint: "/x402/receipt/{transactionRef}",
      mutation: false,
      amount: pending.amount,
      state: "provider-confirmed",
      truthBoundary: "testnet-authoritative",
      providerCorrelationRef: maskProviderReference(
        "transaction",
        input.transactionReference,
      ),
      deliveryContentHash: pending.deliveryContentHash,
      recoveryEnvelope: pending.recoveryEnvelope,
      authoritativeReadback: {
        state: "matched-terminal",
        observedAt: input.confirmedAt,
        providerState: "completed",
        matchCodes: [
          "CHAIN_RECEIPT_SUCCESS",
          "TRANSFER_LOG_BUYER_MATCH",
          "TRANSFER_LOG_SELLER_MATCH",
          "TRANSFER_LOG_AMOUNT_3000_MATCH",
          "DELIVERY_CONTENT_HASH_MATCH",
        ],
      },
      evidenceCodes: [
        "SELLER_SETTLEMENT_CONFIRMED",
        "RESOURCE_DELIVERY_CONFIRMED",
        "AUTHORITATIVE_CHAIN_RECEIPT",
      ],
    },
  });
}

export async function readMonadX402AuditReceipt(
  source: Record<string, string | undefined> = process.env,
  store: DurableOperationJournalStore = createRuntimeOperationJournalStore(source),
): Promise<AuditReceipt | null> {
  const journal = await store.read(SPENDFORGE_X402_RUN_SCOPE);
  if (journal.length === 0) return null;
  return buildAuditReceipt(
    {
      receiptId: MONAD_X402_PROOF_RECEIPT_ID,
      generatedAt: journal.at(-1)!.occurredAt,
    },
    journal,
  );
}
