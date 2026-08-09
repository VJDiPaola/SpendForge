import "server-only";

import {
  buildAuditReceipt,
  type AuditReceipt,
  type DurableOperationJournalStore,
  type OperationJournalEntry,
} from "@/lib/operations";
import { createRuntimeOperationJournalStore } from "@/lib/operations/postgres-store";

import {
  RAIN_NORTHSTAR_PROOF_RECEIPT_ID,
  RAIN_NORTHSTAR_RUN_SCOPE,
} from "./constants";
import { RainNorthstarProofError } from "./provider";

export type RainNorthstarProofResult = {
  receipt: AuditReceipt;
  providerCalls: number;
  mutationCalls: 3;
  readbackCalls: number;
  paymentClaim: "rain-sandbox-simulated-spend-completed";
  fundingClaim: "prior-funding-remains-uncorrelated";
  cardLimitClaim: "request-only" | "direct-readback-match" | "direct-readback-different";
  truthBoundary: "sandbox-authoritative";
};

export async function readRainNorthstarProof(
  source: Record<string, string | undefined> = process.env,
  store: DurableOperationJournalStore = createRuntimeOperationJournalStore(source),
): Promise<RainNorthstarProofResult | null> {
  let journal: readonly OperationJournalEntry[];
  try {
    journal = await store.read(RAIN_NORTHSTAR_RUN_SCOPE);
  } catch {
    throw new RainNorthstarProofError("RAIN_JOURNAL_UNAVAILABLE", 503);
  }
  const completed = [...journal]
    .reverse()
    .find(
      (entry) =>
        entry.operation === "rain.settle_transaction" &&
        entry.state === "provider-confirmed" &&
        entry.authoritativeReadback.state === "matched-terminal" &&
        entry.authoritativeReadback.providerState === "completed",
    );
  if (!completed) return null;
  const card = [...journal]
    .reverse()
    .find((entry) => entry.operation === "rain.issue_scoped_card" && entry.state === "provider-confirmed");
  const cardCodes = card?.authoritativeReadback.matchCodes ?? [];
  return {
    receipt: buildAuditReceipt(
      {
        receiptId: RAIN_NORTHSTAR_PROOF_RECEIPT_ID,
        generatedAt: completed.occurredAt,
      },
      journal,
    ),
    providerCalls: 0,
    mutationCalls: 3,
    readbackCalls: 0,
    paymentClaim: "rain-sandbox-simulated-spend-completed",
    fundingClaim: "prior-funding-remains-uncorrelated",
    cardLimitClaim: cardCodes.includes("CAP_READBACK_MATCH")
      ? "direct-readback-match"
      : cardCodes.includes("CAP_READBACK_DIFFERENT")
        ? "direct-readback-different"
        : "request-only",
    truthBoundary: "sandbox-authoritative",
  };
}

export async function readRainNorthstarAttemptReceipt(
  source: Record<string, string | undefined> = process.env,
  store: DurableOperationJournalStore = createRuntimeOperationJournalStore(source),
): Promise<AuditReceipt | null> {
  const journal = await store.read(RAIN_NORTHSTAR_RUN_SCOPE);
  if (journal.length === 0) return null;
  return buildAuditReceipt(
    {
      receiptId: RAIN_NORTHSTAR_PROOF_RECEIPT_ID,
      generatedAt: journal.at(-1)!.occurredAt,
    },
    journal,
  );
}

export function openProviderState(status: string) {
  return status === "pending" || status === "authorized";
}

export function normalizedProviderState(status: string) {
  if (status === "completed") return "completed" as const;
  if (openProviderState(status)) return "authorized" as const;
  if (status === "declined") return "declined" as const;
  if (status === "reversed") return "failed" as const;
  return "unknown" as const;
}

export function statusEvidenceCode(status: string) {
  if (status === "pending") return "STATUS_PENDING";
  if (status === "authorized") return "STATUS_AUTHORIZED";
  if (status === "completed") return "STATUS_COMPLETED";
  if (status === "declined") return "STATUS_DECLINED";
  if (status === "reversed") return "STATUS_REVERSED";
  return "STATUS_UNRECOGNIZED";
}

